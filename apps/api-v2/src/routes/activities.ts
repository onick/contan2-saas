import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql } from '@contan2/db';
import {
  ActivityCreateRequestSchema,
  type ActivitiesListResponse,
  type ActivityListItem,
  type ActivityCreateResponse,
} from '@contan2/contracts';
import type { ActivityStatus } from '@contan2/db';
import { requireTenantStaff } from '../guard.js';
import { parsePage } from '../query.js';
import {
  normalizeActivityInput,
  mapActivityDetailRow,
  ACTIVITY_DETAIL_COLUMNS,
} from '../activities-input.js';
import {
  assertAllowedImage,
  processCover,
  persistCover,
  CoverError,
} from '../services/cover-upload.js';
import { ensureWritableRoot, StorageError } from '../storage.js';

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
      .returning(ACTIVITY_DETAIL_COLUMNS)
      .executeTakeFirstOrThrow();

    reply.code(201);
    const body: ActivityCreateResponse = { activity: mapActivityDetailRow(row) };
    return body;
  });

  // POST /api/v2/activities/:id/cover · ESCRITURA. Sube y asocia la portada de
  // una actividad EXISTENTE del tenant (flujo: crear → subir portada). Sólo
  // owner/admin. multipart, un archivo, tope duro 5MB. Valida por MAGIC BYTES +
  // decode real (no por MIME/extensión); re-encoda a WebP 1600×900. Escritura
  // atómica + UPDATE; si el UPDATE falla, borra el archivo nuevo. Al reemplazar,
  // borra el archivo v2 anterior sólo tras el éxito (legacy preservado).
  app.post('/activities/:id/cover', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    if (!CAN_CREATE_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para gestionar portadas.' };
    }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    // La actividad debe existir DENTRO del tenant (cross-tenant → 404).
    const existing = await db
      .selectFrom('activities')
      .select(['id', 'image_url'])
      .where('organization_id', '=', orgId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) {
      reply.code(404);
      return { error: 'Actividad no encontrada.' };
    }

    // Multipart: EXACTAMENTE un archivo, tope duro 5MB (límite global del plugin).
    // Iteramos las partes para contar archivos (rechazar 0 o >1) e ignorar campos
    // no-file. Al exceder el tamaño, @fastify/multipart lanza FST_REQ_FILE_TOO_LARGE
    // (puede surgir en toBuffer o al avanzar el iterador) → lo mapeamos a 413.
    let buf: Buffer | undefined;
    let fileCount = 0;
    let oversize = false;
    let parseErr = false;
    try {
      for await (const partItem of req.parts()) {
        if (partItem.type !== 'file') continue; // campos no-file → ignorados
        fileCount += 1;
        if (fileCount > 1) break; // segundo archivo → rechazo (no lo leemos)
        buf = await partItem.toBuffer();
        if (partItem.file.truncated) oversize = true;
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') oversize = true;
      else parseErr = true;
    }
    if (parseErr) {
      reply.code(400);
      return { error: 'Carga de archivo inválida.' };
    }
    if (fileCount > 1) {
      reply.code(400);
      return { error: 'Subí exactamente un archivo.' };
    }
    if (oversize) {
      reply.code(413);
      return { error: 'La imagen supera el máximo de 5 MB.' };
    }
    if (fileCount === 0) {
      reply.code(400);
      return { error: 'Se requiere un archivo de portada.' };
    }
    if (!buf) {
      reply.code(400);
      return { error: 'Archivo de portada inválido.' };
    }

    // Validación por magic bytes + decode real (sharp). Procesa a WebP 1600×900.
    let processed: { data: Buffer; width: number; height: number };
    try {
      assertAllowedImage(buf);
      processed = await processCover(buf);
    } catch (e) {
      reply.code(e instanceof CoverError && e.code === 'unsupported_type' ? 415 : 400);
      return { error: e instanceof Error ? e.message : 'Imagen inválida.' };
    }

    // Storage escribible (no se asume que exista el volumen).
    let root: string;
    try {
      root = await ensureWritableRoot();
    } catch (e) {
      req.log.error({ err: e }, 'uploads dir no escribible');
      reply.code(500);
      return { error: 'Almacenamiento de portadas no disponible.' };
    }

    // Persistencia atómica + UPDATE (rollback del archivo nuevo si falla la DB).
    try {
      const { row } = await persistCover({
        root,
        data: processed.data,
        oldImageUrl: existing.image_url,
        update: (url) =>
          db
            .updateTable('activities')
            .set({ image_url: url, updated_at: sql<string>`now()` })
            .where('organization_id', '=', orgId)
            .where('id', '=', id)
            .returning(ACTIVITY_DETAIL_COLUMNS)
            .executeTakeFirst(),
      });
      reply.code(200);
      const body: ActivityCreateResponse = { activity: mapActivityDetailRow(row) };
      return body;
    } catch (e) {
      if (e instanceof StorageError) {
        req.log.error({ err: e }, 'fallo de storage al guardar portada');
      }
      reply.code(500);
      return { error: 'No se pudo guardar la portada.' };
    }
  });
};
