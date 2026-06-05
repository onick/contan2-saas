import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import {
  ActivityCreateRequestSchema,
  type ActivitiesListResponse,
  type ActivityListItem,
  type ActivityCreateResponse,
  type ActivityDetail,
} from '@contan2/contracts';
import type { ActivityStatus } from '@contan2/db';
import { requireTenantStaff } from '../guard.js';
import { parsePage } from '../query.js';
import { normalizeActivityInput } from '../activities-input.js';

const STATUSES: ReadonlySet<ActivityStatus> = new Set(['activa', 'finalizada', 'cancelada']);

// Crear actividad es tarea administrativa: sólo owner/admin. operator → 403
// (decisión de producto; v1 lo permitía a todo staff, v2 lo acota).
const CAN_CREATE_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);

// GET /api/v2/activities?status=&limit=&offset= · listado tenant-scoped.
export const activitiesRoute: FastifyPluginAsync = async (app) => {
  app.get('/activities', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    const query = (req.query ?? {}) as Record<string, unknown>;
    const { limit, offset } = parsePage(query);
    const status =
      typeof query.status === 'string' && STATUSES.has(query.status as ActivityStatus)
        ? (query.status as ActivityStatus)
        : undefined;

    let rowsQ = db
      .selectFrom('activities')
      .select(['id', 'name', 'type', 'location', 'date', 'capacity', 'enrolled_count', 'status', 'category'])
      .where('organization_id', '=', orgId);
    let countQ = db
      .selectFrom('activities')
      .select(db.fn.countAll<string>().as('n'))
      .where('organization_id', '=', orgId);
    if (status) {
      rowsQ = rowsQ.where('status', '=', status);
      countQ = countQ.where('status', '=', status);
    }

    const [rows, count] = await Promise.all([
      rowsQ.orderBy('date', 'desc').limit(limit).offset(offset).execute(),
      countQ.executeTakeFirstOrThrow(),
    ]);

    const items: ActivityListItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      location: r.location,
      date: r.date.toISOString(),
      capacity: r.capacity,
      enrolledCount: r.enrolled_count,
      status: r.status,
      category: r.category,
    }));

    const body: ActivitiesListResponse = { items, total: Number(count.n), limit, offset };
    return body;
  });

  // POST /api/v2/activities · ESCRITURA. Crea una actividad del tenant de la
  // sesión (organization_id NUNCA del body). status se fija 'activa' (publica
  // al crear) e image_url = null (sin uploads). Sólo owner/admin. enrolled_count
  // toma el default 0. Un solo INSERT (sin tx; no hay unique de negocio).
  app.post('/activities', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    if (!CAN_CREATE_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para crear actividades.' };
    }

    const parsed = ActivityCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Datos de actividad inválidos.' };
    }
    const input = normalizeActivityInput(parsed.data);
    const orgId = guard.ctx.org.id;

    const row = await db
      .insertInto('activities')
      .values({
        id: randomUUID(),
        organization_id: orgId,
        name: input.name,
        type: input.type,
        location: input.location,
        date: input.date,
        end_date: input.endDate,
        capacity: input.capacity,
        description: input.description,
        image_url: null,
        category: input.category,
        status: 'activa',
        // enrolled_count: omitido → default 0.
      })
      .returning([
        'id', 'name', 'type', 'location', 'date', 'end_date', 'capacity',
        'enrolled_count', 'status', 'description', 'image_url', 'category',
        'created_at', 'updated_at',
      ])
      .executeTakeFirstOrThrow();

    const activity: ActivityDetail = {
      id: row.id,
      name: row.name,
      type: row.type,
      location: row.location,
      date: row.date.toISOString(),
      endDate: row.end_date ? row.end_date.toISOString() : null,
      capacity: row.capacity,
      enrolledCount: row.enrolled_count,
      status: row.status,
      description: row.description,
      imageUrl: row.image_url,
      category: row.category,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };

    reply.code(201);
    const body: ActivityCreateResponse = { activity };
    return body;
  });
};
