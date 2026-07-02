import type { FastifyPluginAsync } from 'fastify';
import { getDb, sql } from '@contan2/db';
import type { ShellSummaryResponse, SearchResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { parseSearch, likeContains } from '../query.js';
import { resolveCheckinTz } from './checkin.js';

const TZ = resolveCheckinTz();
const SEARCH_LIMIT = 6;

// Endpoints de soporte del shell admin (sidebar):
//   GET /shell/summary → { role, badges } · un solo fetch para el sidebar.
//   GET /search?q=     → { activities, users } · command palette (⌘K).
// Ambos tenant-scoped vía requireTenantStaff (orgId SIEMPRE de la sesión).
export const shellRoute: FastifyPluginAsync = async (app) => {
  app.get('/shell/summary', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;

    // Inicio del día local del tenant (misma TZ ancla que check-in), para acotar
    // "check-ins de hoy" sin arrastrar las 7 subqueries del overview.
    const todayStart = sql<Date>`(date_trunc('day', now() AT TIME ZONE ${sql.lit(TZ)}) AT TIME ZONE ${sql.lit(TZ)})`;

    const [activeActivities, checkinsToday, protocolPending] = await Promise.all([
      db.selectFrom('activities').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('status', '=', 'activa').executeTakeFirstOrThrow(),
      db.selectFrom('attendance').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('checked_in_at', 'is not', null)
        .where('checked_in_at', '>=', todayStart).executeTakeFirstOrThrow(),
      db.selectFrom('invitations').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('kind', '=', 'protocol')
        .where('status', '=', 'pending').executeTakeFirstOrThrow(),
    ]);

    const body: ShellSummaryResponse = {
      role: guard.ctx.staff.role,
      badges: {
        activeActivities: Number(activeActivities.n),
        checkinsToday: Number(checkinsToday.n),
        protocolPending: Number(protocolPending.n),
      },
    };
    return body;
  });

  app.get('/search', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    const role = guard.ctx.staff.role;

    const parsed = parseSearch((req.query as Record<string, unknown>).q);
    if (parsed.error || !parsed.q) {
      const empty: SearchResponse = { activities: [], users: [] };
      return empty;
    }
    // El rol protocolo está confinado (solo su módulo); no ve el padrón ni la
    // agenda completa, así que su búsqueda de entidades es vacía.
    if (role === 'protocolo') {
      const empty: SearchResponse = { activities: [], users: [] };
      return empty;
    }

    const pattern = likeContains(parsed.q);
    const [activities, users] = await Promise.all([
      db.selectFrom('activities').select(['id', 'name'])
        .where('organization_id', '=', orgId)
        .where('name', 'ilike', pattern)
        .orderBy('date', 'desc').limit(SEARCH_LIMIT).execute(),
      db.selectFrom('users').select(['id', 'first_name', 'last_name', 'code'])
        .where('organization_id', '=', orgId)
        .where((eb) => eb.or([
          eb('code', 'ilike', pattern),
          eb('first_name', 'ilike', pattern),
          eb('last_name', 'ilike', pattern),
          eb('email', 'ilike', pattern),
        ]))
        .orderBy('created_at', 'desc').limit(SEARCH_LIMIT).execute(),
    ]);

    const body: SearchResponse = {
      activities: activities.map((a) => ({ id: String(a.id), name: a.name })),
      users: users.map((u) => ({
        id: String(u.id),
        name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.code,
        code: u.code,
      })),
    };
    return body;
  });
};
