import type { FastifyPluginAsync } from 'fastify';
import { getDb, sql } from '@contan2/db';
import type { AttendanceListResponse, AttendanceListItem } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { parsePage, parseSearch, likeContains, parseIsoDate } from '../query.js';

// GET /api/v2/attendance?limit=&offset=&q=&activityId=&dateFrom=&dateTo= ·
// registros tenant-scoped con datos del visitante por LEFT JOIN (null si anónimo).
// Búsqueda por userCode/nombre/apellido/actividad; filtros por actividad y rango
// de fechas. Filtros + count + paginación SIEMPRE en SQL (nada en memoria).
const MANAGER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);
const deleteLimiter = createRateLimiter({ max: 20, windowMs: 60_000, prefix: endpointPrefix('attendance-delete') });

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

    const search = parseSearch(query.q);
    if (search.error) {
      reply.code(400);
      return { error: 'Parámetro de búsqueda inválido.' };
    }
    const pattern = search.q ? likeContains(search.q) : undefined;

    let activityId: string | undefined;
    if (query.activityId != null) {
      if (typeof query.activityId !== 'string' || query.activityId === '') {
        reply.code(400);
        return { error: 'activityId inválido.' };
      }
      activityId = query.activityId;
    }

    const from = parseIsoDate(query.dateFrom);
    const to = parseIsoDate(query.dateTo);
    if (from === 'invalid' || to === 'invalid') {
      reply.code(400);
      return { error: 'Fecha inválida (usá ISO 8601).' };
    }
    if (from && to && from.getTime() > to.getTime()) {
      reply.code(400);
      return { error: 'dateFrom debe ser anterior o igual a dateTo.' };
    }

    // Filtros (tenant + actividad + rango + búsqueda) aplicados al listado Y al
    // count → `total` exacto. organizationId SIEMPRE del guard, nunca del cliente.
    // El LEFT JOIN a users es 1:1 (u.id = a.user_id) → no multiplica el count.
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
      .leftJoin('users as u', 'u.id', 'a.user_id')
      .select(db.fn.countAll<string>().as('n'))
      .where('a.organization_id', '=', orgId);
    if (activityId) {
      rowsQ = rowsQ.where('a.activity_id', '=', activityId);
      countQ = countQ.where('a.activity_id', '=', activityId);
    }
    if (from) {
      rowsQ = rowsQ.where('a.registered_at', '>=', from);
      countQ = countQ.where('a.registered_at', '>=', from);
    }
    if (to) {
      rowsQ = rowsQ.where('a.registered_at', '<=', to);
      countQ = countQ.where('a.registered_at', '<=', to);
    }
    if (pattern) {
      rowsQ = rowsQ.where((eb) =>
        eb.or([
          eb('a.user_code', 'ilike', pattern),
          eb('u.first_name', 'ilike', pattern),
          eb('u.last_name', 'ilike', pattern),
          eb('a.activity_name', 'ilike', pattern),
        ]),
      );
      countQ = countQ.where((eb) =>
        eb.or([
          eb('a.user_code', 'ilike', pattern),
          eb('u.first_name', 'ilike', pattern),
          eb('u.last_name', 'ilike', pattern),
          eb('a.activity_name', 'ilike', pattern),
        ]),
      );
    }

    const [rows, count] = await Promise.all([
      rowsQ
        .orderBy('a.registered_at', 'desc')
        .orderBy('a.id', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
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

  // DELETE /api/v2/attendance/:id · quita una asistencia (paridad v1, mejorada):
  // owner/admin; borra la fila (org-scoped) y DEVUELVE el cupo por partySize
  // (1 + niños acompañantes — v1 siempre devolvía 1), con piso en 0. La visita
  // histórica del usuario (visit_count) NO se descuenta (paridad v1). Audit.
  app.delete('/attendance/:id', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!MANAGER_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403); return { error: 'No tenés permiso para quitar asistencias.' };
    }
    if ((await deleteLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiadas operaciones seguidas. Espera un momento.' };
    }
    const id = (req.params as { id: string }).id;

    const removed = await db.transaction().execute(async (tx) => {
      const att = await tx.deleteFrom('attendance')
        .where('organization_id', '=', guard.ctx.org.id)
        .where('id', '=', id)
        .returning(['activity_id', 'companions_children', 'user_code'])
        .executeTakeFirst();
      if (!att) return null;
      const partySize = 1 + (att.companions_children ?? 0);
      await tx.updateTable('activities')
        .set(() => ({ enrolled_count: sql<number>`greatest(0, enrolled_count - ${partySize})` }))
        .where('organization_id', '=', guard.ctx.org.id)
        .where('id', '=', att.activity_id)
        .execute();
      await tx.insertInto('tenant_audit_log').values({
        organization_id: guard.ctx.org.id,
        actor_staff_id: guard.ctx.staff.id,
        actor_email_masked: null,
        actor_role: guard.ctx.staff.role,
        action: 'attendance.deleted',
        target_type: 'attendance',
        target_id: id,
        target_label: att.user_code,
        metadata: JSON.stringify({ activityId: att.activity_id, partySize }),
      }).execute();
      return att;
    });
    if (!removed) { reply.code(404); return { error: 'Registro no encontrado.' }; }
    reply.code(204);
    return null;
  });
};
