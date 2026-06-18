import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getDb, sql } from '@contan2/db';
import {
  ActivityCreateRequestSchema,
  ActivityUpdateRequestSchema,
  ActivityStatusUpdateSchema,
  type ActivitiesListResponse,
  type ActivityListItem,
  type ActivityCreateResponse,
  type ActivitySummaryResponse,
} from '@contan2/contracts';
import type { ActivityStatus } from '@contan2/db';
import { requireTenantStaff } from '../guard.js';
import { parsePage } from '../query.js';
import {
  normalizeActivityInput,
  normalizeActivityUpdate,
  mapActivityDetailRow,
  ACTIVITY_DETAIL_COLUMNS,
} from '../activities-input.js';
import {
  assertAllowedImage,
  processCover,
  persistCover,
  CoverError,
} from '../services/cover-upload.js';
import { ensureWritableRoot, deletePreviousCoverIfV2, StorageError } from '../storage.js';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';

// Escrituras admin de actividades: 30/min por org+IP (auditoría 2026-06-10:
// no tenían limiter; el guard ya exige owner/admin — esto frena el abuso de
// una sesión comprometida o un script descontrolado). Las LECTURAS no se
// limitan (la UI las usa en cada render).
const writeLimiter = createRateLimiter({ max: 30, windowMs: 60_000, prefix: endpointPrefix('activities-write') });
const LIMIT_MSG = 'Demasiadas operaciones seguidas. Espera un momento.';

const STATUSES: ReadonlySet<ActivityStatus> = new Set(['activa', 'finalizada', 'cancelada']);

// Crear/editar/portada/cambiar-estado: owner/admin/operator (los operadores
// gestionan actividades, como en v1). El hard-delete queda en owner/admin
// (destructivo) → CAN_DELETE_ROLES.
const CAN_CREATE_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'operator']);
const CAN_DELETE_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);

// Gracia de 60s para "fecha no en el pasado" (paridad con el create / v1).
const ACTIVITY_DATE_PAST_GRACE_MS = 60_000;

// Transiciones de estado permitidas (paridad acordada). Mismo estado = idempotente
// (se maneja aparte). Reactivar (finalizada|cancelada → activa) se permite AUNQUE
// la fecha haya pasado. El hard-delete existe pero GUARDADO (paridad v1): con
// asistencias registradas exige cancelar primero; ver DELETE /activities/:id.
const ALLOWED_TRANSITIONS: Record<ActivityStatus, ReadonlySet<ActivityStatus>> = {
  activa: new Set(['finalizada', 'cancelada']),
  finalizada: new Set(['activa']),
  cancelada: new Set(['activa']),
};

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
      .select(['id', 'name', 'type', 'location', 'date', 'capacity', 'enrolled_count', 'status', 'category', 'image_url', 'image_pos_y', 'audience'])
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
      imageUrl: r.image_url,
      imagePosY: r.image_pos_y,
      audience: r.audience,
    }));

    const body: ActivitiesListResponse = { items, total: Number(count.n), limit, offset };
    return body;
  });

  // GET /api/v2/activities/:id · LECTURA. Detalle COMPLETO de una actividad del
  // tenant (incluye description/endDate/imageUrl que el listado no proyecta) →
  // lo consume el drawer/edición bajo demanda (Lifecycle A2). Guard tenant→auth
  // (requireTenantStaff): cualquier staff del tenant (owner/admin/operator) puede
  // consultar; sin sesión → 401; cross-tenant / inexistente → 404. Responde
  // ActivityDetail (organization_id NO se proyecta). Cero writes.
  app.get('/activities/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const row = await db
      .selectFrom('activities')
      .select(ACTIVITY_DETAIL_COLUMNS)
      .where('organization_id', '=', orgId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      reply.code(404);
      return { error: 'Actividad no encontrada.' };
    }

    reply.code(200);
    return mapActivityDetailRow(row);
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
    if ((await writeLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: LIMIT_MSG };
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
        image_pos_y: parsed.data.imagePosY ?? null,
        category: input.category,
        audience: input.audience,
        status: 'activa',
        // enrolled_count: omitido → default 0.
      })
      .returning(ACTIVITY_DETAIL_COLUMNS)
      .executeTakeFirstOrThrow();

    reply.code(201);
    const body: ActivityCreateResponse = { activity: mapActivityDetailRow(row) };
    return body;
  });

  // POST /api/v2/activities/with-cover · ESCRITURA ATÓMICA. Crea una actividad
  // nueva con su portada OBLIGATORIA en un solo request multipart (campos +
  // EXACTAMENTE un archivo). Garantía server-side: la actividad se INSERTA desde
  // el inicio con `image_url`; si falla el procesamiento, la escritura del archivo
  // o el INSERT → no se crea actividad y se borra el archivo nuevo (sin huérfanos
  // ni `.tmp-*`). Nunca publica una actividad sin portada. Sólo owner/admin
  // (operator 403). organization_id/status/image_url/enrolled_count jamás del
  // cliente. El endpoint legacy `POST /activities` se mantiene por compatibilidad.
  app.post('/activities/with-cover', async (req: FastifyRequest, reply) => {
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
    if ((await writeLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: LIMIT_MSG };
    }
    const orgId = guard.ctx.org.id;

    // Multipart: campos de actividad + EXACTAMENTE un archivo (tope duro 5MB del
    // plugin). Bufferizamos el archivo en memoria pero NO lo escribimos a disco
    // hasta validar todo → un body inválido no deja archivo ni actividad.
    const fields: Record<string, string> = {};
    let buf: Buffer | undefined;
    let fileCount = 0;
    let oversize = false;
    let parseErr = false;
    try {
      for await (const partItem of req.parts()) {
        if (partItem.type === 'file') {
          fileCount += 1;
          if (fileCount > 1) break; // segundo archivo → rechazo (no lo leemos)
          buf = await partItem.toBuffer();
          if (partItem.file.truncated) oversize = true;
        } else {
          fields[partItem.fieldname] = String(partItem.value ?? '');
        }
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
      return { error: 'Subí exactamente un archivo de portada.' };
    }
    if (oversize) {
      reply.code(413);
      return { error: 'La imagen supera el máximo de 5 MB.' };
    }
    if (fileCount === 0 || !buf) {
      reply.code(400);
      return { error: 'La portada es obligatoria.' };
    }

    // Campos prohibidos del cliente → 400 (no se derivan del body).
    for (const k of ['organizationId', 'organization_id', 'status', 'imageUrl', 'image_url', 'image_pos_y', 'enrolledCount', 'enrolled_count', 'id']) {
      if (k in fields) {
        reply.code(400);
        return { error: `Campo no permitido: ${k}.` };
      }
    }

    // Validar campos con el contrato existente (coerción de tipos como el form).
    const candidate: Record<string, unknown> = {
      name: fields.name?.trim(),
      type: fields.type,
      location: fields.location?.trim(),
      date: fields.date,
      ...(fields.endDate ? { endDate: fields.endDate } : {}),
      ...(fields.capacity !== undefined && fields.capacity !== '' ? { capacity: Number(fields.capacity) } : {}),
      ...(fields.imagePosY !== undefined && fields.imagePosY !== '' ? { imagePosY: Number(fields.imagePosY) } : {}),
      ...(fields.description ? { description: fields.description } : {}),
      ...(fields.category ? { category: fields.category } : {}),
      ...(fields.audience ? { audience: fields.audience } : {}),
    };
    const parsed = ActivityCreateRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Datos de actividad inválidos.' };
    }
    const input = normalizeActivityInput(parsed.data);

    // Validar imagen por MAGIC BYTES + decode real (sharp) → WebP 1600×900. Si
    // falla, NO se escribió ningún archivo ni actividad.
    let processed: { data: Buffer; width: number; height: number };
    try {
      assertAllowedImage(buf);
      processed = await processCover(buf);
    } catch (e) {
      reply.code(e instanceof CoverError && e.code === 'unsupported_type' ? 415 : 400);
      return { error: e instanceof Error ? e.message : 'Imagen inválida.' };
    }

    let root: string;
    try {
      root = await ensureWritableRoot();
    } catch (e) {
      req.log.error({ err: e }, 'uploads dir no escribible (with-cover)');
      reply.code(500);
      return { error: 'Almacenamiento de portadas no disponible.' };
    }

    // Atómico: escribir archivo → INSERT con image_url. `persistCover` borra el
    // archivo nuevo si el INSERT lanza o devuelve nada (rollback) → sin huérfanos.
    try {
      const { row } = await persistCover({
        root,
        data: processed.data,
        oldImageUrl: null,
        update: (url) =>
          db
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
              image_url: url,
              image_pos_y: parsed.data.imagePosY ?? null,
              category: input.category,
              audience: input.audience,
              status: 'activa',
            })
            .returning(ACTIVITY_DETAIL_COLUMNS)
            .executeTakeFirst(),
      });
      reply.code(201);
      const body: ActivityCreateResponse = { activity: mapActivityDetailRow(row) };
      return body;
    } catch (e) {
      req.log.error({ err: e }, 'with-cover: fallo al crear actividad con portada');
      reply.code(500);
      return { error: 'No se pudo crear la actividad con portada. Intentá de nuevo.' };
    }
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
    if ((await writeLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: LIMIT_MSG };
    }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    // La actividad debe existir DENTRO del tenant (cross-tenant → 404).
    const existing = await db
      .selectFrom('activities')
      .select(['id', 'image_url', 'image_pos_y'])
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

  // PATCH /api/v2/activities/:id · ESCRITURA. Edición PARCIAL de una actividad del
  // tenant. Sólo owner/admin. Cuerpo validado por ActivityUpdateRequestSchema
  // (.strict() → rechaza organizationId/enrolledCount/imageUrl/status/etc). Las
  // validaciones cruzadas usan los valores EFECTIVOS (enviado ?? existente). La
  // guarda de capacidad va en el WHERE del UPDATE → atómica (sin carrera con el
  // check-in: si enrolled_count creció por encima de la nueva capacidad, no
  // actualiza → 409). organization_id/enrolled_count/image_url NUNCA se tocan.
  app.patch('/activities/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    if (!CAN_CREATE_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para editar actividades.' };
    }
    if ((await writeLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: LIMIT_MSG };
    }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const parsed = ActivityUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Datos de actividad inválidos.' };
    }

    // Cargar la actividad DENTRO del tenant (cross-tenant / inexistente → 404).
    const existing = await db
      .selectFrom('activities')
      .select(['status', 'date', 'end_date', 'capacity', 'enrolled_count'])
      .where('organization_id', '=', orgId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) {
      reply.code(404);
      return { error: 'Actividad no encontrada.' };
    }

    const data = parsed.data;
    // Valores EFECTIVOS (enviado ?? existente) para las validaciones cruzadas.
    const effDate = data.date !== undefined ? new Date(data.date) : existing.date;
    const effEnd =
      data.endDate !== undefined
        ? data.endDate
          ? new Date(data.endDate)
          : null
        : existing.end_date;
    const effCapacity = data.capacity !== undefined ? data.capacity : existing.capacity;

    if (effEnd && effEnd.getTime() < effDate.getTime()) {
      reply.code(400);
      return { error: 'La fecha de cierre debe ser igual o posterior a la de inicio.' };
    }
    // Sólo una actividad ACTIVA no puede quedar con fecha pasada (las terminales
    // conservan su fecha histórica, p. ej. al reactivar después).
    if (existing.status === 'activa' && effDate.getTime() < Date.now() - ACTIVITY_DATE_PAST_GRACE_MS) {
      reply.code(400);
      return { error: 'La fecha debe ser presente o futura.' };
    }
    if (effCapacity < existing.enrolled_count) {
      reply.code(409);
      return { error: 'La capacidad no puede ser menor que la cantidad de inscritos.' };
    }

    const setFields = normalizeActivityUpdate(data);
    // UPDATE atómico: la guarda `enrolled_count <= effCapacity` en el WHERE evita
    // la carrera con el check-in (si subió por encima, no actualiza → 409).
    const row = await db
      .updateTable('activities')
      .set({ ...setFields, updated_at: sql<string>`now()` })
      .where('organization_id', '=', orgId)
      .where('id', '=', id)
      .where('enrolled_count', '<=', effCapacity)
      .returning(ACTIVITY_DETAIL_COLUMNS)
      .executeTakeFirst();
    if (!row) {
      // La fila existe (ya la cargamos) → perdió la carrera de capacidad.
      reply.code(409);
      return { error: 'La capacidad no puede ser menor que la cantidad de inscritos.' };
    }

    // TODO Redis C-C: invalidar la cache pública del tenant aquí
    // (DEL `${env}:pubacts:${orgId}`). Sin cache aún → no-op.

    reply.code(200);
    const body: ActivityCreateResponse = { activity: mapActivityDetailRow(row) };
    return body;
  });

  // PATCH /api/v2/activities/:id/status · ESCRITURA. Cambia el estado según la
  // matriz de transiciones. Mismo estado → 200 idempotente (sin tocar updated_at).
  // Transición no permitida → 409. Reactivar permite fecha pasada. Sin emails ni
  // hard-delete. Sólo owner/admin.
  app.patch('/activities/:id/status', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    if (!CAN_CREATE_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para cambiar el estado de actividades.' };
    }
    if ((await writeLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: LIMIT_MSG };
    }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const parsed = ActivityStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Estado inválido.' };
    }
    const target = parsed.data.status;

    const existing = await db
      .selectFrom('activities')
      .select(ACTIVITY_DETAIL_COLUMNS)
      .where('organization_id', '=', orgId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) {
      reply.code(404);
      return { error: 'Actividad no encontrada.' };
    }

    // Idempotente: mismo estado → devuelve la actividad sin escribir (no bumpea
    // updated_at).
    if (existing.status === target) {
      reply.code(200);
      return { activity: mapActivityDetailRow(existing) } satisfies ActivityCreateResponse;
    }
    if (!ALLOWED_TRANSITIONS[existing.status].has(target)) {
      reply.code(409);
      return { error: `No se puede pasar de ${existing.status} a ${target}.` };
    }

    const row = await db
      .updateTable('activities')
      .set({ status: target, updated_at: sql<string>`now()` })
      .where('organization_id', '=', orgId)
      .where('id', '=', id)
      .returning(ACTIVITY_DETAIL_COLUMNS)
      .executeTakeFirstOrThrow();

    // TODO Redis C-C: invalidar cache pública del tenant (DEL pubacts:${orgId}).

    reply.code(200);
    const body: ActivityCreateResponse = { activity: mapActivityDetailRow(row) };
    return body;
  });

  // GET /api/v2/activities/:id/summary · resumen post-evento/en vivo (paridad
  // v1 /insights/activity-summary, reescrito set-based: v1 hacía N+1 por
  // asistente). Cualquier staff del tenant (read-only). Métricas:
  //   · total = TODAS las asistencias (los anónimos cuentan: estuvieron en sala);
  //   · nuevos/habituales/VIPs sólo sobre identificados (afinidad);
  //   · "previas" = asistencias totales del usuario en la org − esta;
  //   · mejora v2: companions/peopleInRoom (niños acompañantes del kiosko).
  app.get('/activities/:id/summary', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const activity = await db
      .selectFrom('activities')
      .select(['id', 'capacity', 'enrolled_count'])
      .where('organization_id', '=', orgId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!activity) {
      reply.code(404);
      return { error: 'Actividad no encontrada.' };
    }

    const atts = await db
      .selectFrom('attendance')
      .select(['user_id', 'companions_children', 'companions_adults'])
      .where('organization_id', '=', orgId)
      .where('activity_id', '=', id)
      .execute();

    const totalAttendances = atts.length;
    const identifiedRows = atts.filter((a) => a.user_id !== null);
    const anonymousCount = totalAttendances - identifiedRows.length;
    // Único por (org,user,activity) en DB → cada fila identificada es un usuario.
    const identifiedIds = [...new Set(identifiedRows.map((a) => a.user_id!))];
    const identifiedCount = identifiedIds.length;
    const companionsChildren = atts.reduce((sum, a) => sum + (a.companions_children ?? 0), 0);
    const companionsAdults = atts.reduce((sum, a) => sum + (a.companions_adults ?? 0), 0);

    // Asistencias TOTALES por usuario identificado (en toda la org), en un solo
    // GROUP BY — define nuevo (=1), habitual (>1) y VIP (>=10).
    let newcomers = 0;
    let returning = 0;
    let vipCount = 0;
    let priorSum = 0;
    if (identifiedCount > 0) {
      const counts = await db
        .selectFrom('attendance')
        .select(['user_id', db.fn.countAll<number>().as('n')])
        .where('organization_id', '=', orgId)
        .where('user_id', 'in', identifiedIds)
        .groupBy('user_id')
        .execute();
      for (const c of counts) {
        const n = Number(c.n);
        if (n <= 1) newcomers += 1;
        else returning += 1;
        if (n >= 10) vipCount += 1;
        priorSum += Math.max(0, n - 1);
      }
    }

    const occupancyPct = activity.capacity > 0
      ? Math.round((activity.enrolled_count / activity.capacity) * 100)
      : 0;

    const body: ActivitySummaryResponse = {
      summary: {
        totalAttendances,
        identifiedCount,
        anonymousCount,
        occupancyPct,
        newcomers,
        returning,
        vipCount,
        avgPriorAttendances: identifiedCount > 0 ? Math.round((priorSum / identifiedCount) * 10) / 10 : 0,
        newcomerRatio: identifiedCount > 0 ? Math.round((newcomers / identifiedCount) * 100) : 0,
        companionsChildren,
        companionsAdults,
        peopleInRoom: totalAttendances + companionsChildren + companionsAdults,
      },
    };
    return body;
  });

  // DELETE /api/v2/activities/:id · ESCRITURA destructiva, GUARDADA (paridad v1):
  //   · sólo owner/admin (operator 403); cross-tenant/inexistente → 404;
  //   · con asistencias y estado ≠ cancelada → 409 "cancelala primero";
  //   · cancelada (o sin asistencias) → purga attendance + borra la actividad en
  //     UNA transacción, audita activity.deleted y borra el archivo de portada v2
  //     (best-effort, fuera de la tx; archivos legacy v1 se preservan). 204.
  // visit_count de los usuarios NO se toca (paridad v1: sólo purga attendance).
  app.delete('/activities/:id', async (req: FastifyRequest, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    if (!CAN_DELETE_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para eliminar actividades.' };
    }
    if ((await writeLimiter.hit(`${guard.ctx.org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: LIMIT_MSG };
    }
    const orgId = guard.ctx.org.id;
    const id = (req.params as { id: string }).id;

    const existing = await db
      .selectFrom('activities')
      .select(['id', 'name', 'status', 'image_url'])
      .where('organization_id', '=', orgId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!existing) {
      reply.code(404);
      return { error: 'Actividad no encontrada.' };
    }

    const att = await db
      .selectFrom('attendance')
      .select(db.fn.countAll<number>().as('n'))
      .where('organization_id', '=', orgId)
      .where('activity_id', '=', id)
      .executeTakeFirstOrThrow();
    const attendanceCount = Number(att.n);

    if (attendanceCount > 0 && existing.status !== 'cancelada') {
      reply.code(409);
      return { error: 'La actividad tiene asistencias registradas. Cancelala primero y luego podrás eliminarla.' };
    }

    await db.transaction().execute(async (tx) => {
      if (attendanceCount > 0) {
        await tx.deleteFrom('attendance').where('organization_id', '=', orgId).where('activity_id', '=', id).execute();
      }
      await tx.deleteFrom('activities').where('organization_id', '=', orgId).where('id', '=', id).execute();
      // Auditoría (sin PII: nombre de la actividad no es PII de visitantes).
      await tx
        .insertInto('tenant_audit_log')
        .values({
          organization_id: orgId,
          actor_staff_id: guard.ctx.staff.id,
          actor_email_masked: null,
          actor_role: guard.ctx.staff.role,
          action: 'activity.deleted',
          target_type: 'activity',
          target_id: id,
          metadata: JSON.stringify({ name: existing.name, attendancePurged: attendanceCount }),
        })
        .execute();
    });

    // Archivo de portada v2 (best-effort, fuera de la tx; legacy v1 intacto).
    if (existing.image_url) {
      try {
        const root = await ensureWritableRoot();
        await deletePreviousCoverIfV2(root, existing.image_url);
      } catch (e) {
        req.log.warn({ err: e }, 'no se pudo borrar el archivo de portada al eliminar la actividad');
      }
    }

    reply.code(204);
    return null;
  });
};
