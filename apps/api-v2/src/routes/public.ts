// apps/api-v2/src/routes/public.ts · slice PÚBLICO para el kiosko. Tenant por
// host (resolveTenantFromHost), SIN cookie de staff — paridad con v1, donde
// /api/public/* se monta bajo resolveTenant pero sin requireAuth.
//   GET  /public/activities      · actividades visibles (read-only)
//   GET  /public/users/lookup    · lookup de visitante (read-only, rate-limited)
//   POST /public/checkin         · check-in (ESCRITURA, rate-limited, tx única)
// El check-in NO emite QR PNG ni manda email (eso va en el PR de credencial);
// devuelve el código real (QR = user.code).

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql, type DbClient } from '@contan2/db';
import { resolveTenantCode, generateUserCode } from '@contan2/codes';
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

// Error de check-in con status HTTP, para que la transacción lo lance y haga
// ROLLBACK, y el handler lo mapee a la respuesta.
class CheckinError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'CheckinError';
  }
}

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
      .select(['id', 'name', 'type', 'category', 'location', 'date', 'capacity', 'enrolled_count', 'image_url'])
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
      if (!code) {
        reply.code(400);
        return { error: 'Formato inválido. Usa tu código (CCB-XXXXXX) o tu correo.' };
      }
      row = await db
        .selectFrom('users')
        .select(['code', 'first_name', 'last_name', 'visit_count'])
        .where('organization_id', '=', t.orgId)
        .where('code', '=', code)
        .executeTakeFirst();
    }

    if (!row) {
      reply.code(404);
      return { error: 'No te encontramos con ese dato.' };
    }

    const body: PublicVisitorLookupResponse = {
      visitor: {
        firstName: row.first_name,
        lastName: row.last_name,
        code: row.code,
        visitCount: row.visit_count,
      },
    };
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
    const partySize = 1 + companionsChildren;
    // Visitante NUEVO con email → tras el commit se le entrega la credencial por
    // correo (best-effort, fuera de la tx). El visitante EXISTENTE no reenvía.
    let deliver: DeliverUser | null = null;

    try {
      const result = await db.transaction().execute(async (tx): Promise<PublicCheckinResponse> => {
        // 1 · Resolver o crear visitante (scoped al tenant).
        let user: { id: string; code: string; visit_count: number };
        let isNew = false;
        if ('new' in visitor) {
          isNew = true;
          const v = visitor.new;
          const email = v.email ? v.email.toLowerCase() : null;
          if (email) {
            const exists = await tx.selectFrom('users').select('id')
              .where('organization_id', '=', orgId).where('email', '=', email).executeTakeFirst();
            if (exists) throw new CheckinError(409, 'Ese correo ya está registrado. Identifícate con tu código.');
          }
          // Código REAL con retry-on-collision (unique users_org_code_unique).
          // visit_count = 1: este check-in ES su primera visita (DB default es 1).
          let created: { id: string; code: string; visit_count: number } | undefined;
          for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
            created = await tx.insertInto('users').values({
              id: randomUUID(),
              organization_id: orgId,
              code: generateUserCode(t.codePrefix),
              first_name: v.firstName,
              last_name: v.lastName,
              email,
              phone: v.phone ?? null,
              visit_count: 1,
            })
              .onConflict((oc) => oc.columns(['organization_id', 'code']).doNothing())
              .returning(['id', 'code', 'visit_count'])
              .executeTakeFirst();
          }
          if (!created) throw new CheckinError(500, 'No se pudo generar un código único.');
          user = created;
          if (email) {
            deliver = { id: created.id, code: created.code, email, firstName: v.firstName, lastName: v.lastName };
          }
        } else {
          let q = tx.selectFrom('users').select(['id', 'code', 'visit_count']).where('organization_id', '=', orgId);
          if ('code' in visitor) {
            const code = resolveTenantCode(visitor.code, t.codePrefix);
            if (!code) throw new CheckinError(400, 'Código inválido.');
            q = q.where('code', '=', code);
          } else {
            q = q.where('email', '=', visitor.email.toLowerCase());
          }
          const found = await q.executeTakeFirst();
          if (!found) throw new CheckinError(404, 'No te encontramos con ese dato.');
          user = found;
        }

        // 2 · Reserva ATÓMICA de cupo: el WHERE garantiza enrolled+party <= capacity.
        const reserved = await tx.updateTable('activities')
          .set({ enrolled_count: sql<number>`enrolled_count + ${partySize}` })
          .where('organization_id', '=', orgId)
          .where('id', '=', activityId)
          .where('status', '=', 'activa')
          .where(sql<boolean>`enrolled_count + ${partySize} <= capacity`)
          .returning(['id', 'name'])
          .executeTakeFirst();
        if (!reserved) {
          const act = await tx.selectFrom('activities').select(['status', 'enrolled_count', 'capacity'])
            .where('organization_id', '=', orgId).where('id', '=', activityId).executeTakeFirst();
          if (!act) throw new CheckinError(404, 'Actividad no encontrada.');
          if (act.status !== 'activa') throw new CheckinError(409, 'La actividad no está activa.');
          throw new CheckinError(409, 'Cupo agotado.');
        }

        // 3 · Asistencia. El ON CONFLICT es el ÚNICO árbitro de duplicado
        //     (org,user,activity): si choca (re-check-in o carrera concurrente),
        //     no devuelve fila → throw → ROLLBACK de la transacción → la reserva
        //     del paso 2 se DESHACE (capacidad intacta, sin oversell).
        const att = await tx.insertInto('attendance').values({
          id: randomUUID(),
          organization_id: orgId,
          user_id: user.id,
          user_code: user.code,
          activity_id: reserved.id,
          activity_name: reserved.name,
          companions_children: companionsChildren,
          checked_in_at: new Date().toISOString(),
          anonymous: false,
        })
          .onConflict((oc) => oc.columns(['organization_id', 'user_id', 'activity_id']).doNothing())
          .returning('id')
          .executeTakeFirst();
        if (!att) throw new CheckinError(409, 'Ya estás registrado en esta actividad.');

        // 4 · Visitas: el NUEVO ya cuenta su 1ª visita (visit_count=1 al crear);
        //     al EXISTENTE se le incrementa.
        let visitCount = user.visit_count;
        if (!isNew) {
          await tx.updateTable('users').set({ visit_count: sql<number>`visit_count + 1` })
            .where('id', '=', user.id).execute();
          visitCount = user.visit_count + 1;
        }

        return {
          code: user.code,
          visitCount,
          partySize,
          activity: { id: reserved.id, name: reserved.name },
        };
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
