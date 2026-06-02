// apps/api-v2/src/routes/public.ts · slice PÚBLICO read-only para el kiosko.
// Tenant por host (resolveTenantFromHost), SIN cookie de staff — paridad con
// v1, donde /api/public/* se monta bajo resolveTenant pero sin requireAuth.
// Dos endpoints: actividades visibles y lookup de visitante (rate-limited).
// Read-only puro: cero escrituras, cero Resend, cero QR real.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, type DbClient } from '@contan2/db';
import { resolveTenantCode } from '@contan2/codes';
import type {
  PublicActivitiesResponse,
  PublicActivity,
  PublicVisitorLookupResponse,
} from '@contan2/contracts';
import { resolveTenantFromHost, effectiveHost } from '../tenant.js';

// Rate-limit in-memory para el lookup (anti-enumeración de códigos/emails).
// Ventana fija por IP, port directo de v1 (backend/src/routes/public.js).
// Suficiente para una instancia; con N réplicas se movería a un store
// compartido. NO se aplica a /activities (listado no sensible).
const LOOKUP_LIMIT = 15;
const LOOKUP_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string, now: number): boolean {
  const cur = hits.get(ip);
  if (!cur || now >= cur.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + LOOKUP_WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > LOOKUP_LIMIT;
}

// Limpieza perezosa de buckets vencidos (cota el crecimiento del Map).
function sweep(now: number): void {
  for (const [ip, b] of hits) if (now >= b.resetAt) hits.delete(ip);
}

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

    const now = Date.now();
    sweep(now);
    if (rateLimited(req.ip, now)) {
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
};
