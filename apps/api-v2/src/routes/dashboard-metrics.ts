import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import type { DashboardMetricsResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';

// GET /api/v2/dashboard/metrics · KPIs agregados del tenant (read-only).
// Cada count está filtrado por organization_id (frontera de seguridad pre-RLS).
export const dashboardMetricsRoute: FastifyPluginAsync = async (app) => {
  app.get('/dashboard/metrics', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;

    const [users, activities, activeActivities, attendance, checkedIn] = await Promise.all([
      db.selectFrom('users').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).executeTakeFirstOrThrow(),
      db.selectFrom('activities').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).executeTakeFirstOrThrow(),
      db.selectFrom('activities').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).where('status', '=', 'activa').executeTakeFirstOrThrow(),
      db.selectFrom('attendance').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).executeTakeFirstOrThrow(),
      db.selectFrom('attendance').select(db.fn.countAll<string>().as('n'))
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
};
