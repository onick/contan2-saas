import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import type { AttendanceListResponse, AttendanceListItem } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { parsePage } from '../query.js';

// GET /api/v2/attendance?activityId=&limit=&offset= · registros de asistencia
// tenant-scoped, con datos del visitante por LEFT JOIN (null si es anónimo).
export const attendanceRoute: FastifyPluginAsync = async (app) => {
  app.get('/attendance', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    const query = (req.query ?? {}) as Record<string, unknown>;
    const { limit, offset } = parsePage(query);
    const activityId = typeof query.activityId === 'string' ? query.activityId : undefined;

    let rowsQ = db
      .selectFrom('attendance as a')
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .select([
        'a.id', 'a.user_code', 'a.activity_id', 'a.activity_name',
        'a.anonymous', 'a.checked_in_at', 'a.registered_at',
        'u.first_name', 'u.last_name',
      ])
      .where('a.organization_id', '=', orgId);
    let countQ = db
      .selectFrom('attendance as a')
      .select(db.fn.countAll<string>().as('n'))
      .where('a.organization_id', '=', orgId);
    if (activityId) {
      rowsQ = rowsQ.where('a.activity_id', '=', activityId);
      countQ = countQ.where('a.activity_id', '=', activityId);
    }

    const [rows, count] = await Promise.all([
      rowsQ.orderBy('a.registered_at', 'desc').limit(limit).offset(offset).execute(),
      countQ.executeTakeFirstOrThrow(),
    ]);

    const items: AttendanceListItem[] = rows.map((r) => ({
      id: r.id,
      userCode: r.user_code,
      firstName: r.first_name,
      lastName: r.last_name,
      activityId: r.activity_id,
      activityName: r.activity_name,
      anonymous: r.anonymous,
      checkedInAt: r.checked_in_at ? r.checked_in_at.toISOString() : null,
      registeredAt: r.registered_at.toISOString(),
    }));

    const body: AttendanceListResponse = { items, total: Number(count.n), limit, offset };
    return body;
  });
};
