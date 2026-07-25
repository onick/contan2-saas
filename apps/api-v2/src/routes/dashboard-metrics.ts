import type { FastifyPluginAsync } from 'fastify';
import { getDb, sql, withTenant } from '@contan2/db';
import type { DashboardMetricsResponse, DashboardOverviewResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { dashboardOverview, parsePeriod } from '../services/dashboard-overview.js';
import { resolveCheckinTz } from './checkin.js';

const TZ = resolveCheckinTz();

// GET /api/v2/dashboard/metrics · KPIs agregados del tenant (read-only).
// GET /api/v2/dashboard/overview?period= · agregado período-aware (paridad v1).
// Cada count está filtrado por organization_id (frontera de seguridad pre-RLS).
export const dashboardMetricsRoute: FastifyPluginAsync = async (app) => {
  app.get('/dashboard/overview', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const period = parsePeriod((req.query as Record<string, unknown>).period);
    return withTenant(db, guard.ctx.org.id, async (db) => {
    const body: DashboardOverviewResponse = await dashboardOverview(db, guard.ctx.org.id, period, TZ);
    return body;
    });
  });

  app.get('/dashboard/metrics', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {

    const [users, activities, activeActivities, attendance, checkedIn] = await Promise.all([
      db.selectFrom('users').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).executeTakeFirstOrThrow(),
      db.selectFrom('activities').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).executeTakeFirstOrThrow(),
      db.selectFrom('activities').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('status', '=', 'activa').executeTakeFirstOrThrow(),
      // PERSONAS, no filas: cada asistencia vale 1 + sus acompañantes (los
      // acompañantes ocupan cupo pero no tienen fila propia).
      db.selectFrom('attendance')
        .select(sql<string>`count(*) + coalesce(sum(companions_children + companions_adults), 0)`.as('n'))
        .where('organization_id', '=', orgId).executeTakeFirstOrThrow(),
      db.selectFrom('attendance')
        .select(sql<string>`count(*) + coalesce(sum(companions_children + companions_adults), 0)`.as('n'))
        .where('organization_id', '=', orgId).where('checked_in_at', 'is not', null).executeTakeFirstOrThrow(),
    ]);

    const body: DashboardMetricsResponse = {
      metrics: {
        totalUsers: Number(users.n),
        totalActivities: Number(activities.n),
        activeActivities: Number(activeActivities.n),
        totalAttendance: Number(attendance.n),
        checkedIn: Number(checkedIn.n),
      },
    };
    return body;
    });
  });
};
