// apps/api-v2/src/routes/public.ts · slice PÚBLICO para el kiosko. Tenant por
// host (resolveTenantFromHost), SIN cookie de staff — paridad con v1, donde
// /api/public/* se monta bajo resolveTenant pero sin requireAuth.
//   GET  /public/activities      · actividades visibles (read-only)
//   GET  /public/users/lookup    · lookup de visitante (read-only, rate-limited)
//   POST /public/checkin         · check-in (ESCRITURA, rate-limited, tx única)
// El check-in NO emite QR PNG ni manda email (eso va en el PR de credencial);
// devuelve el código real (QR = user.code).

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import { resolveTenantCode } from '@contan2/codes';
import {
  PublicCheckinRequestSchema,
  type PublicActivitiesResponse,
  type PublicActivity,
  type PublicVisitorLookupResponse,
  type PublicCheckinResponse,
} from '@contan2/contracts';
import { resolveTenantFromHost, effectiveHost } from '../tenant.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { deliverCredential, type DeliverUser } from '../services/credential-delivery.js';
// Núcleo transaccional COMPARTIDO (público/scanner/admin): resuelve/crea visitante,
// reserva cupo atómica y registra asistencia idempotente. CheckinError → ROLLBACK.
import { CheckinError, checkinIdentified } from '../services/checkin-core.js';

// Rate-limit detrás del limiter compartido: Redis (estado entre réplicas) si hay
// REDIS_URL, in-memory con degradación grácil si no. Buckets SEPARADOS por
// endpoint (lookup 15/60s · check-in 10/60s), aislados por entorno + tenant: la
// key es `${orgId}:${ip}` (sin PII: nunca email/código/token). El lookup protege
// contra enumeración de códigos/emails; /activities (listado no sensible) no se
// limita.
const lookupLimiter = createRateLimiter({ max: 15, windowMs: 60_000, prefix: endpointPrefix('public-lookup') });
const checkinLimiter = createRateLimiter({ max: 10, windowMs: 60_000, prefix: endpointPrefix('public-checkin') });

type TenantOnly =
  | { ok: true; orgId: string; codePrefix: string }
  | { ok: false; status: number; error: string };

// Resuelve el tenant por host SIN exigir cookie. Mismo mapeo de error que el
// guard de staff para hosts no-tenant / inexistentes / suspendidos. Expone
// codePrefix para resolver códigos cortos en el lookup.
async function tenantOnly(db: DbClient, req: FastifyRequest): Promise<TenantOnly> {
  const tenant = await resolveTenantFromHost(db, effectiveHost(req));
  if (tenant.ok) return { ok: true, orgId: tenant.org.id, codePrefix: tenant.org.codePrefix };
  return tenant.reason === 'suspended'
    ? { ok: false, status: 503, error: 'Organización suspendida' }
    : { ok: false, status: 404, error: 'Organización no encontrada' };
}

export const publicRoute: FastifyPluginAsync = async (app) => {
  // GET /api/v2/public/activities · actividades visibles (status activa y con
  // cupo). Paridad v1: enrolledCount < capacity. `date` sale en ISO; el cliente
  // del kiosko lo formatea (mismo patrón que el endpoint staff).
  app.get('/public/activities', async (req, reply) => {
    const db = getDb();
    const t = await tenantOnly(db, req);
    if (!t.ok) {
      reply.code(t.status);
      return { error: t.error };
    }

    const rows = await db
      .selectFrom('activities')
      .select(['id', 'name', 'type', 'category', 'location', 'date', 'capacity', 'enrolled_count', 'image_url', 'image_pos_y'])
      .where('organization_id', '=', t.orgId)
      .where('status', '=', 'activa')
      .orderBy('date', 'asc')
      .execute();

    // Filtro de cupo en JS (read-only-safe; el set por tenant es chico).
    const activities: PublicActivity[] = rows
      .filter((r) => r.enrolled_count < r.capacity)
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        category: r.category,
        location: r.location,
        date: r.date.toISOString(),
        capacity: r.capacity,
        enrolledCount: r.enrolled_count,
        imageUrl: r.image_url,
        imagePosY: r.image_pos_y,
      }));

    const body: PublicActivitiesResponse = { activities, total: activities.length };
    return body;
  });

  // GET /api/v2/public/users/lookup?q= · busca un visitante del tenant por
  // código completo (CCB-XXXXXX) o email exacto. Rate-limited. Devuelve un
  // shape mínimo sin email/phone/id/tokens (anti-leak de PII).
  app.get('/public/users/lookup', async (req, reply) => {
    const db = getDb();
    const t = await tenantOnly(db, req);
    if (!t.ok) {
      reply.code(t.status);
      return { error: t.error };
    }

    if ((await lookupLimiter.hit(`${t.orgId}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' };
    }

    const q = String((req.query as Record<string, unknown>).q ?? '').trim();
    if (!q) {
      reply.code(400);
      return { error: 'Falta el parámetro q (código o correo).' };
    }

    const toVisitor = (r: { code: string; first_name: string; last_name: string; visit_count: number }) => ({
      firstName: r.first_name, lastName: r.last_name, code: r.code, visitCount: r.visit_count,
    });

    let row: { code: string; first_name: string; last_name: string; visit_count: number } | undefined;
    if (q.includes('@')) {
      row = await db
        .selectFrom('users')
        .select(['code', 'first_name', 'last_name', 'visit_count'])
        .where('organization_id', '=', t.orgId)
        .where('email', '=', q.toLowerCase())
        .executeTakeFirst();
    } else {
      // Resuelve a código canónico: completo as-is, o corto + prefijo del tenant
      // (lógica en @contan2/codes · resolveTenantCode, fuente del contrato).
      const code = resolveTenantCode(q, t.codePrefix);
      if (code) {
        row = await db
          .selectFrom('users')
          .select(['code', 'first_name', 'last_name', 'visit_count'])
          .where('organization_id', '=', t.orgId)
          .where('code', '=', code)
          .executeTakeFirst();
      } else {
        // NOMBRE Y APELLIDO (kiosko). Anti-enumeración en endpoint público:
        //   · exige ≥2 palabras — nada de substrings de "maria" a secas;
        //   · cada palabra escrita debe ser PREFIJO de alguna palabra del nombre
        //     completo (case/acentos-insensible). Así "marcelino francisco"
        //     encuentra a "Marcelino Francisco M." y "ana perez" a "Ana María
        //     Pérez" — el match exacto anterior fallaba con apellidos dobles o
        //     abreviados (bug real reportado 2026-06-11);
        //   · homónimos: hasta 5 para que el visitante elija; más → pedir código;
        //   · excluye archivados; mismo rate-limit 15/min por org+IP.
        const words = q.split(/\s+/).filter(Boolean);
        if (words.length < 2) {
          reply.code(400);
          return { error: 'Escribe tu nombre y apellido, o usa tu código (CCB-XXXXXX) o correo.' };
        }
        // Sólo letras (con acentos/ñ), apóstrofe y guión: deja las palabras
        // LIKE-safe (sin %_\) y descarta basura. Palabra vacía tras sanear → 400.
        const clean = words.map((w) => w.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ'’-]/g, ''));
        if (clean.some((w) => w.length === 0) || clean.length > 6) {
          reply.code(400);
          return { error: 'Escribe tu nombre y apellido, o usa tu código (CCB-XXXXXX) o correo.' };
        }
        const ACC = 'áéíóúüÁÉÍÓÚÜ';
        const PLAIN = 'aeiouuAEIOUU';
        let nameQ = db
          .selectFrom('users')
          .select(['code', 'first_name', 'last_name', 'visit_count'])
          .where('organization_id', '=', t.orgId)
          .where('deleted_at', 'is', null);
        for (const w of clean) {
          // Prefijo a inicio de palabra: ' nombre completo' LIKE '% palabra%'.
          nameQ = nameQ.where(
            sql<boolean>`' ' || lower(translate(first_name || ' ' || last_name, ${ACC}, ${PLAIN})) like '% ' || lower(translate(${w}, ${ACC}, ${PLAIN})) || '%'`,
          );
        }
        const matches = await nameQ
          .orderBy('visit_count', 'desc')
          .limit(6)
          .execute();
        if (matches.length === 1) {
          row = matches[0];
        } else if (matches.length >= 2 && matches.length <= 5) {
          const body: PublicVisitorLookupResponse = { matches: matches.map(toVisitor) };
          return body;
        } else if (matches.length > 5) {
          reply.code(404);
          return { error: 'Hay varias personas con ese nombre. Usa tu código (CCB-XXXXXX) o tu correo.' };
        }
      }
    }

    if (!row) {
      reply.code(404);
      return { error: 'No te encontramos con ese dato.' };
    }

    const body: PublicVisitorLookupResponse = { visitor: toVisitor(row) };
    return body;
  });

  // POST /api/v2/public/checkin · ESCRITURA. Una sola transacción: resolver/crear
  // visitante (scoped al tenant), descontar cupo atómicamente, registrar
  // asistencia (idempotente por (org,user,activity)) e incrementar visitas. Sin
  // QR PNG ni email (PR aparte). Cada adulto = identidad propia; sólo niños como
  // acompañantes → partySize = 1 + companionsChildren.
  app.post('/public/checkin', async (req, reply) => {
    const db = getDb();
    const t = await tenantOnly(db, req);
    if (!t.ok) {
      reply.code(t.status);
      return { error: t.error };
    }

    if ((await checkinLimiter.hit(`${t.orgId}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' };
    }

    const parsed = PublicCheckinRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Datos de check-in inválidos.' };
    }
    const { activityId, visitor, companionsChildren } = parsed.data;
    const orgId = t.orgId;
    // Visitante NUEVO con email → tras el commit se le entrega la credencial por
    // correo (best-effort, fuera de la tx). El visitante EXISTENTE no reenvía.
    let deliver: DeliverUser | null = null;

    try {
      const result = await db.transaction().execute(async (tx): Promise<PublicCheckinResponse> => {
        // Núcleo COMPARTIDO: resuelve/crea visitante + reserva cupo atómica +
        // asistencia idempotente + visitas (mismo comportamiento que antes).
        const r = await checkinIdentified(tx, { orgId, codePrefix: t.codePrefix, activityId, visitor, companionsChildren });
        deliver = r.deliver;
        return { code: r.code, visitCount: r.visitCount, partySize: r.partySize, activity: r.activity };
      });

      // Commit OK. Entrega de credencial best-effort, FUERA de la transacción y
      // fire-and-forget: no bloquea ni afecta la respuesta del check-in. Marca
      // credential_sent_at sólo si el envío fue real (dry-run sin RESEND_API_KEY
      // no marca). Sólo para visitante nuevo con email.
      if (deliver) {
        void deliverCredential(db, orgId, deliver).catch((err: unknown) => {
          req.log.error({ err }, 'entrega de credencial falló');
        });
      }

      return result;
    } catch (e) {
      if (e instanceof CheckinError) {
        reply.code(e.status);
        return { error: e.message };
      }
      throw e;
    }
  });
};
