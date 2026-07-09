import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { getDb, sql, withTenant } from '@contan2/db';
import { normalizeCodeForLookup, isValidCode, generateUserCode } from '@contan2/codes';
import type {
  User, UserListItem, UserActivityStatus,
  UsersListResponse, UsersFacetsResponse, UserDetailResponse,
  UserActivityHistoryResponse, UserAffinityResponse, AffinityBucket,
} from '@contan2/contracts';
import { AdminUserUpdateRequestSchema, AdminUserCreateRequestSchema } from '@contan2/contracts';
import type { AdminCredentialResendResponse, AdminCredentialResendResult, AdminUserArchiveResponse, AdminUserCreateResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { writeUserAudit } from '../services/user-audit.js';
import { deliverCredential } from '../services/credential-delivery.js';
import { cohortCondition, statusCondition } from '../services/users-query.js';
import { writeReportAudit } from '../services/report-audit.js';
import { loadUsersForExport, buildUsersCsv, buildUsersWorkbook, USERS_EXPORT_CAP } from '../services/users-export.js';
import { parseUsersFile, classifyRows, commitNewRows, buildImportTemplate, IMPORT_MAX_BYTES } from '../services/users-import.js';
import type { UsersImportPreviewResponse, UsersImportCommitResponse } from '@contan2/contracts';
import { createRateLimiter, endpointPrefix } from '../rate-limit.js';
import { parsePage, parseSearch, parseCohort, parseUserStatusFilter, likeContains } from '../query.js';

// Editar/archivar/reenviar credencial es administrativo: sólo owner/admin (operator → 403).
const CAN_WRITE_USER_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);

// Reenvío de credencial: idempotencia en checkin_idempotency (endpoint dedicado) +
// rate-limit por tenant + actor + IP. NUNCA envío masivo (1 visitante por request).
const CRED_ENDPOINT = 'credential.resend';
const credLimiter = createRateLimiter({ max: 5, windowMs: 60_000, prefix: endpointPrefix('credential-resend') });

// Alta de visitante: 30/min por org+IP (operación de puerta, paridad con el ritmo
// del check-in; suficiente para registro en evento, frena scripting).
const createLimiter = createRateLimiter({ max: 30, windowMs: 60_000, prefix: endpointPrefix('user-create') });

// Export del padrón: 6/min por org+IP (extracción de PII masiva, generación
// pesada de workbook).
const exportLimiter = createRateLimiter({ max: 6, windowMs: 60_000, prefix: endpointPrefix('users-export') });

// Import en lote: 3/min por org+IP (operación pesada que escribe usuarios).
const importLimiter = createRateLimiter({ max: 3, windowMs: 60_000, prefix: endpointPrefix('users-import') });

// Columnas calificadas (listado y detalle hacen join con el agregado de última visita).
const LIST_COLUMNS = [
  'users.id', 'users.code', 'users.first_name', 'users.last_name', 'users.email',
  'users.phone', 'users.visit_count', 'users.created_at', 'users.credential_sent_at', 'users.deleted_at',
] as const;

const DAY_MS = 86_400_000;
const toIso = (v: Date | string): string => (v instanceof Date ? v : new Date(v)).toISOString();

interface DetailRow {
  id: string; code: string; first_name: string; last_name: string;
  email: string | null; phone: string | null; visit_count: number; created_at: Date;
}
function toUser(r: DetailRow): User {
  return {
    id: r.id, code: r.code, firstName: r.first_name, lastName: r.last_name,
    email: r.email, phone: r.phone, visitCount: r.visit_count, createdAt: toIso(r.created_at),
  };
}

// Estado de actividad derivado de la última visita (MAX checked_in_at):
//   nunca visitó            → 'dormant'
//   última visita ≤ 30 días → 'active'
//   última visita > 90 días → 'dormant'
//   31–90 días (intermedia) → null  (sin etiqueta, decisión de producto)
function deriveStatus(lastVisit: Date | null): UserActivityStatus | null {
  if (!lastVisit) return 'dormant';
  const days = (Date.now() - lastVisit.getTime()) / DAY_MS;
  if (days <= 30) return 'active';
  if (days > 90) return 'dormant';
  return null;
}

interface ListRow extends DetailRow {
  credential_sent_at: Date | null;
  deleted_at: Date | null;
  last_visit_at: Date | string | null;
}
function toListItem(r: ListRow): UserListItem {
  const lastVisit = r.last_visit_at ? new Date(r.last_visit_at) : null;
  return {
    ...toUser(r),
    lastVisitAt: lastVisit ? lastVisit.toISOString() : null,
    credentialSentAt: r.credential_sent_at ? toIso(r.credential_sent_at) : null,
    status: deriveStatus(lastVisit),
    deletedAt: r.deleted_at ? toIso(r.deleted_at) : null,
  };
}

// cohortCondition / statusCondition viven en services/users-query.ts (fuente de
// verdad compartida con el export).

// GET /api/v2/users (listado + cohortes), /users/facets (conteos) y /users/:code.
export const usersRoute: FastifyPluginAsync = async (app) => {
  app.get('/users', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const query = (req.query ?? {}) as Record<string, unknown>;
    const { limit, offset } = parsePage(query);
    const search = parseSearch(query.q);
    if (search.error) {
      reply.code(400);
      return { error: 'Parámetro de búsqueda inválido.' };
    }
    const pattern = search.q ? likeContains(search.q) : undefined;
    const cohort = parseCohort(query.cohort);
    const cohortCond = cohortCondition(cohort);
    const statusCond = statusCondition(parseUserStatusFilter(query.status));

    // Última visita por usuario en UNA agregación (LEFT JOIN a MAX agrupado), no
    // N+1. lv.last_visit_at es NULL para quien nunca asistió. organizationId
    // SIEMPRE del guard (sesión), jamás del cliente.
    let rowsQ = db.selectFrom('users')
      .leftJoin(
        (eb) => eb.selectFrom('attendance')
          .select(['attendance.user_id'])
          .select((e) => e.fn.max('attendance.checked_in_at').as('last_visit_at'))
          .where('attendance.organization_id', '=', orgId)
          .where('attendance.checked_in_at', 'is not', null)
          .groupBy('attendance.user_id')
          .as('lv'),
        (join) => join.onRef('lv.user_id', '=', 'users.id'),
      )
      .select([...LIST_COLUMNS, 'lv.last_visit_at'])
      .where('users.organization_id', '=', orgId);
    let countQ = db.selectFrom('users')
      .leftJoin(
        (eb) => eb.selectFrom('attendance')
          .select(['attendance.user_id'])
          .select((e) => e.fn.max('attendance.checked_in_at').as('last_visit_at'))
          .where('attendance.organization_id', '=', orgId)
          .where('attendance.checked_in_at', 'is not', null)
          .groupBy('attendance.user_id')
          .as('lv'),
        (join) => join.onRef('lv.user_id', '=', 'users.id'),
      )
      .select(db.fn.countAll<string>().as('n'))
      .where('users.organization_id', '=', orgId);

    // Búsqueda: code/nombre/apellido/email/teléfono (ILIKE). El MISMO where va al
    // listado y al count → `total` refleja búsqueda + cohorte.
    if (pattern) {
      rowsQ = rowsQ.where((eb) => eb.or([
        eb('users.code', 'ilike', pattern),
        eb('users.first_name', 'ilike', pattern),
        eb('users.last_name', 'ilike', pattern),
        eb('users.email', 'ilike', pattern),
        eb('users.phone', 'ilike', pattern),
      ]));
      countQ = countQ.where((eb) => eb.or([
        eb('users.code', 'ilike', pattern),
        eb('users.first_name', 'ilike', pattern),
        eb('users.last_name', 'ilike', pattern),
        eb('users.email', 'ilike', pattern),
        eb('users.phone', 'ilike', pattern),
      ]));
    }
    if (cohortCond) { rowsQ = rowsQ.where(cohortCond); countQ = countQ.where(cohortCond); }
    if (statusCond) { rowsQ = rowsQ.where(statusCond); countQ = countQ.where(statusCond); }

    const [rows, count] = await Promise.all([
      rowsQ.orderBy('users.created_at', 'desc').orderBy('users.id', 'desc').limit(limit).offset(offset).execute(),
      countQ.executeTakeFirstOrThrow(),
    ]);

    const body: UsersListResponse = {
      items: rows.map((r) => toListItem(r as ListRow)),
      total: Number(count.n),
      limit,
      offset,
    };
    return body;
    });
  });

  // GET /api/v2/users/facets · conteos EXACTOS por cohorte, tenant-scoped, dentro
  // de la búsqueda `q` vigente (no del cohorte: cada pill muestra su propio total).
  // Una sola query con `count(*) filter (where …)` + el join de última visita.
  app.get('/users/facets', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const query = (req.query ?? {}) as Record<string, unknown>;
    const search = parseSearch(query.q);
    if (search.error) {
      reply.code(400);
      return { error: 'Parámetro de búsqueda inválido.' };
    }
    const pattern = search.q ? likeContains(search.q) : undefined;
    const statusCond = statusCondition(parseUserStatusFilter(query.status));

    let q = db.selectFrom('users')
      .leftJoin(
        (eb) => eb.selectFrom('attendance')
          .select(['attendance.user_id'])
          .select((e) => e.fn.max('attendance.checked_in_at').as('last_visit_at'))
          .where('attendance.organization_id', '=', orgId)
          .where('attendance.checked_in_at', 'is not', null)
          .groupBy('attendance.user_id')
          .as('lv'),
        (join) => join.onRef('lv.user_id', '=', 'users.id'),
      )
      .where('users.organization_id', '=', orgId);
    if (pattern) {
      q = q.where((eb) => eb.or([
        eb('users.code', 'ilike', pattern),
        eb('users.first_name', 'ilike', pattern),
        eb('users.last_name', 'ilike', pattern),
        eb('users.email', 'ilike', pattern),
        eb('users.phone', 'ilike', pattern),
      ]));
    }
    if (statusCond) q = q.where(statusCond);
    const row = await q.select([
      sql<string>`count(*)`.as('all'),
      sql<string>`count(*) filter (where users.visit_count >= 3)`.as('frequent'),
      sql<string>`count(*) filter (where users.created_at >= now() - interval '7 days')`.as('new7d'),
      sql<string>`count(*) filter (where users.email is null)`.as('noEmail'),
      sql<string>`count(*) filter (where users.email is not null and users.credential_sent_at is null)`.as('noCredential'),
      sql<string>`count(*) filter (where lv.last_visit_at >= now() - interval '30 days')`.as('active'),
      sql<string>`count(*) filter (where lv.last_visit_at is null or lv.last_visit_at < now() - interval '90 days')`.as('dormant'),
    ]).executeTakeFirstOrThrow();

    const body: UsersFacetsResponse = {
      counts: {
        all: Number(row.all),
        frequent: Number(row.frequent),
        new7d: Number(row.new7d),
        noEmail: Number(row.noEmail),
        noCredential: Number(row.noCredential),
        active: Number(row.active),
        dormant: Number(row.dormant),
      },
    };
    return body;
    });
  });

  // GET /api/v2/users/export?format=csv|xlsx&cohort=&status=&q=&scope=view|all
  // Exporta el padrón (PII masiva) → owner/admin, rate-limited, auditado. Honra
  // los mismos filtros del listado (scope=view, default) o el padrón completo
  // (scope=all, respeta sólo el estado de archivado). Ruta ESTÁTICA: gana a
  // /users/:code en el router.
  app.get('/users/export', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    return withTenant(db, org.id, async (db) => {
    if (!CAN_WRITE_USER_ROLES.has(staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para exportar el padrón.' };
    }
    if ((await exportLimiter.hit(`${org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiadas exportaciones seguidas. Esperá un momento.' };
    }

    const q = (req.query ?? {}) as Record<string, unknown>;
    const format = String(q.format ?? 'csv').toLowerCase();
    if (format !== 'csv' && format !== 'xlsx') {
      reply.code(400);
      return { error: 'Formato inválido: usá csv o xlsx.' };
    }
    const search = parseSearch(q.q);
    if (search.error) { reply.code(400); return { error: 'Parámetro de búsqueda inválido.' }; }
    const scope = q.scope === 'all' ? 'all' : 'view';
    const cohort = parseCohort(q.cohort);
    const status = parseUserStatusFilter(q.status);

    const { rows, total, truncated } = await loadUsersForExport(db, org.id, { cohort, status, search: search.q, scope });

    await writeReportAudit(db, {
      orgId: org.id,
      staff: { id: staff.id, email: staff.email, role: staff.role },
      report: 'users-padron',
      format,
      meta: { scope, cohort, status, rows: rows.length, total, truncated, cap: USERS_EXPORT_CAP },
      ip: req.ip,
      ua: req.headers['user-agent'] ?? null,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      const filename = `padron-visitantes_${stamp}.csv`;
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      reply.header('cache-control', 'no-store');
      if (truncated) reply.header('x-export-truncated', String(total));
      return buildUsersCsv(rows);
    }
    const buf = await buildUsersWorkbook(rows, {
      name: org.name, primaryColor: org.primaryColor ?? null,
      secondaryColor: org.secondaryColor ?? null, logoUrl: org.logoUrl ?? null,
    });
    const filename = `padron-visitantes_${stamp}.xlsx`;
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('content-disposition', `attachment; filename="${filename}"`);
    reply.header('cache-control', 'no-store');
    if (truncated) reply.header('x-export-truncated', String(total));
    return reply.send(buf);
    });
  });

  // GET /api/v2/users/import/template?format=csv|xlsx · plantilla descargable.
  app.get('/users/import/template', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!CAN_WRITE_USER_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403); return { error: 'No tenés permiso para importar visitantes.' };
    }
    const format = (req.query as Record<string, unknown>).format === 'xlsx' ? 'xlsx' : 'csv';
    const { body, contentType, filename } = await buildImportTemplate(format);
    reply.header('content-type', contentType);
    reply.header('content-disposition', `attachment; filename="${filename}"`);
    reply.header('cache-control', 'no-store');
    return reply.send(body);
  });

  // POST /api/v2/users/import?commit=false|true · importar visitantes en lote.
  // owner/admin; multipart (un archivo CSV/XLSX, 5MB). commit=false → PREVIEW
  // (clasifica, SIN escrituras). commit=true → crea SÓLO las filas `new` (jamás
  // sobreescribe; ver invariante en services/users-import.ts). Rate-limit + audit.
  app.post('/users/import', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    const { org, staff } = guard.ctx;
    return withTenant(db, org.id, async (db) => {
    if (!CAN_WRITE_USER_ROLES.has(staff.role)) {
      reply.code(403); return { error: 'No tenés permiso para importar visitantes.' };
    }
    if ((await importLimiter.hit(`${org.id}:${req.ip}`)).limited) {
      reply.code(429); return { error: 'Demasiadas importaciones seguidas. Esperá un momento.' };
    }
    const commit = (req.query as Record<string, unknown>).commit === 'true';

    // Leer el archivo (exactamente uno). Tope 5MB del plugin; truncado → 413.
    let buf: Buffer | undefined;
    let filename = '';
    let fileCount = 0;
    let oversize = false;
    let parseErr = false;
    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          fileCount += 1;
          if (fileCount > 1) break;
          filename = part.filename ?? '';
          buf = await part.toBuffer();
          if (part.file.truncated) oversize = true;
        }
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') oversize = true;
      else parseErr = true;
    }
    if (parseErr) { reply.code(400); return { error: 'Carga de archivo inválida.' }; }
    if (fileCount > 1) { reply.code(400); return { error: 'Subí exactamente un archivo.' }; }
    if (oversize) { reply.code(413); return { error: `El archivo supera el máximo de ${IMPORT_MAX_BYTES / (1024 * 1024)} MB.` }; }
    if (!buf || buf.length === 0) { reply.code(400); return { error: 'Subí un archivo CSV o Excel.' }; }

    const parsed = await parseUsersFile(buf, filename);
    if (parsed.error) { reply.code(400); return { error: parsed.error }; }

    const { rows, summary, truncated } = await classifyRows(db, org.id, parsed.rows);

    if (!commit) {
      const body: UsersImportPreviewResponse = { mode: 'preview', rows, summary, truncated };
      return body;
    }

    // commit=true: inserta SÓLO las `new` (defensa en profundidad en el servicio).
    const result = await commitNewRows(
      db, org.id, org.codePrefix,
      { id: staff.id, email: staff.email, role: staff.role },
      rows, req.ip, req.headers['user-agent'] ?? null,
    );
    reply.code(201);
    const body: UsersImportCommitResponse = { mode: 'commit', result, summary };
    return body;
    });
  });

  // GET /api/v2/users/:code · detalle ENRIQUECIDO (UserListItem: + última visita,
  // credencial, estado). Misma agregación de última visita que el listado.
  app.get('/users/:code', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const code = normalizeCodeForLookup((req.params as { code: string }).code);
    if (!isValidCode(code)) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }

    const row = await db.selectFrom('users')
      .leftJoin(
        (eb) => eb.selectFrom('attendance')
          .select(['attendance.user_id'])
          .select((e) => e.fn.max('attendance.checked_in_at').as('last_visit_at'))
          .where('attendance.organization_id', '=', orgId)
          .where('attendance.checked_in_at', 'is not', null)
          .groupBy('attendance.user_id')
          .as('lv'),
        (join) => join.onRef('lv.user_id', '=', 'users.id'),
      )
      .select([...LIST_COLUMNS, 'lv.last_visit_at'])
      .where('users.organization_id', '=', orgId)
      .where('users.code', '=', code)
      .executeTakeFirst();
    if (!row) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }
    const body: UserDetailResponse = { user: toListItem(row as ListRow) };
    return body;
    });
  });

  // GET /api/v2/users/:code/activities · historial paginado del visitante (RSVP +
  // asistencias; checkedInAt null = registró pero no asistió). Una query + count.
  app.get('/users/:code/activities', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const code = normalizeCodeForLookup((req.params as { code: string }).code);
    if (!isValidCode(code)) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }
    const user = await db.selectFrom('users').select('id')
      .where('organization_id', '=', orgId).where('code', '=', code).executeTakeFirst();
    if (!user) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }
    const { limit, offset } = parsePage((req.query ?? {}) as Record<string, unknown>, 10, 50);

    const base = db.selectFrom('attendance')
      .innerJoin('activities', 'activities.id', 'attendance.activity_id')
      .where('attendance.organization_id', '=', orgId)
      .where('attendance.user_id', '=', user.id);
    const [rows, count] = await Promise.all([
      base
        .select([
          'attendance.activity_id as activityId',
          'activities.name as name',
          'activities.type as type',
          'activities.location as location',
          'activities.status as status',
          'attendance.registered_at as registeredAt',
          'attendance.checked_in_at as checkedInAt',
          'attendance.companions_children as companionsChildren',
          'attendance.companions_adults as companionsAdults',
        ])
        // Orden determinista: por asistencia/registro desc, desempate por activity_id.
        .orderBy(sql`coalesce(attendance.checked_in_at, attendance.registered_at) desc`)
        .orderBy('attendance.activity_id', 'desc')
        .limit(limit).offset(offset).execute(),
      base.select(db.fn.countAll<string>().as('n')).executeTakeFirstOrThrow(),
    ]);
    const body: UserActivityHistoryResponse = {
      items: rows.map((r) => ({
        activityId: r.activityId,
        name: r.name,
        type: r.type,
        location: r.location,
        status: r.status,
        registeredAt: toIso(r.registeredAt),
        checkedInAt: r.checkedInAt ? toIso(r.checkedInAt) : null,
        attended: r.checkedInAt != null,
        companionsChildren: r.companionsChildren,
        companionsAdults: r.companionsAdults,
      })),
      total: Number(count.n),
      limit,
      offset,
    };
    return body;
    });
  });

  // GET /api/v2/users/:code/affinity · intereses/ubicaciones DERIVADOS on-demand de
  // las asistencias REALES (checked_in_at IS NOT NULL). Agregaciones, sin N+1, sin
  // materializar ni cachear PII.
  app.get('/users/:code/affinity', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const code = normalizeCodeForLookup((req.params as { code: string }).code);
    if (!isValidCode(code)) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }
    const user = await db.selectFrom('users').select('id')
      .where('organization_id', '=', orgId).where('code', '=', code).executeTakeFirst();
    if (!user) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }

    const TOP = 6;
    const base = () => db.selectFrom('attendance')
      .innerJoin('activities', 'activities.id', 'attendance.activity_id')
      .where('attendance.organization_id', '=', orgId)
      .where('attendance.user_id', '=', user.id)
      .where('attendance.checked_in_at', 'is not', null);

    const [byType, byCategory, byLocation, agg] = await Promise.all([
      base().select(['activities.type as key']).select(db.fn.countAll<string>().as('count'))
        .groupBy('activities.type').orderBy(sql`count(*) desc`).orderBy('activities.type').limit(TOP).execute(),
      base().select(['activities.category as key']).select(db.fn.countAll<string>().as('count'))
        .where('activities.category', 'is not', null)
        .groupBy('activities.category').orderBy(sql`count(*) desc`).orderBy('activities.category').limit(TOP).execute(),
      base().select(['activities.location as key']).select(db.fn.countAll<string>().as('count'))
        .groupBy('activities.location').orderBy(sql`count(*) desc`).orderBy('activities.location').limit(TOP).execute(),
      base().select(db.fn.countAll<string>().as('total'))
        .select((e) => e.fn.max('attendance.checked_in_at').as('lastVisit')).executeTakeFirstOrThrow(),
    ]);

    const toBuckets = (rows: Array<{ key: string | null; count: string }>): AffinityBucket[] =>
      rows.filter((r) => r.key != null && r.key !== '').map((r) => ({ key: r.key as string, count: Number(r.count) }));
    const lastVisit = agg.lastVisit ? new Date(agg.lastVisit) : null;

    const body: UserAffinityResponse = {
      byType: toBuckets(byType),
      byCategory: toBuckets(byCategory),
      byLocation: toBuckets(byLocation),
      totalAttended: Number(agg.total),
      lastVisitAt: lastVisit ? lastVisit.toISOString() : null,
      status: deriveStatus(lastVisit),
    };
    return body;
    });
  });

  // POST /api/v2/users · alta de visitante desde el padrón (S1 · paridad v1).
  // CUALQUIER staff autenticado (operator registra gente en puerta, igual que v1;
  // a diferencia de editar/archivar que son owner/admin). El código se genera
  // server-side con el code_prefix REAL del tenant (mismo algoritmo que v1 →
  // continuidad de credenciales; retry anti-colisión vía unique (org,code)).
  // visit_count arranca en 0 (registrar ≠ visitar; el check-in es quien suma).
  // Si trae email: unicidad por tenant (409) + envío de credencial (dry-run sin
  // RESEND_API_KEY) con resultado honesto. Auditoría user.created (sin PII).
  app.post('/users', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const { org, staff } = guard.ctx;
    return withTenant(db, org.id, async (db) => {
    if ((await createLimiter.hit(`${org.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiadas altas en poco tiempo. Esperá un momento.' };
    }
    const parsed = AdminUserCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
    }
    const p = parsed.data;
    const email = p.email ? p.email.toLowerCase() : null;

    let created: { id: string; code: string } | undefined;
    try {
      created = await withTenant(db, org.id, async (tx) => {
        if (email) {
          const exists = await tx
            .selectFrom('users').select('id')
            .where('organization_id', '=', org.id).where('email', '=', email)
            .executeTakeFirst();
          if (exists) throw new Error('EMAIL_TAKEN');
        }
        let row: { id: string; code: string } | undefined;
        for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
          row = await tx
            .insertInto('users')
            .values({
              id: randomUUID(),
              organization_id: org.id,
              code: generateUserCode(org.codePrefix),
              first_name: p.firstName,
              last_name: p.lastName,
              email,
              phone: p.phone ?? null,
              visit_count: 0,
            })
            .onConflict((oc) => oc.columns(['organization_id', 'code']).doNothing())
            .returning(['id', 'code'])
            .executeTakeFirst();
        }
        if (!row) throw new Error('CODE_EXHAUSTED');
        await writeUserAudit(tx, {
          orgId: org.id, staff, action: 'user.created', targetUserId: row.id,
          metadata: { hasEmail: !!email, hasPhone: !!p.phone },
          ip: req.ip, ua: req.headers['user-agent'] ?? null,
        });
        return row;
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'EMAIL_TAKEN') {
        reply.code(409);
        return { error: 'Ese correo ya está registrado en la organización.' };
      }
      if (e instanceof Error && e.message === 'CODE_EXHAUSTED') {
        reply.code(500);
        return { error: 'No se pudo generar un código único. Intentá de nuevo.' };
      }
      throw e;
    }

    // Entrega de credencial (fuera de la tx, como el resend): best-effort, honesto.
    let credential: AdminUserCreateResponse['credential'] = 'skipped';
    if (email) {
      const r = await deliverCredential(db, org.id, { id: created.id, code: created.code, email, firstName: p.firstName, lastName: p.lastName }, {});
      if ('sent' in r && r.sent === true) credential = 'sent';
      else if ('skipped' in r && r.skipped && /RESEND/i.test(r.reason ?? '')) credential = 'dry-run';
      else if ('skipped' in r && r.skipped) credential = 'skipped';
      else credential = 'error';
    }

    reply.code(201);
    const body: AdminUserCreateResponse = {
      user: { id: created.id, code: created.code, firstName: p.firstName, lastName: p.lastName, email, phone: p.phone ?? null },
      credential,
    };
    return body;
    });
  });

  // PATCH /api/v2/users/:code · editar visitante (UI-2 · F2B). Sólo owner/admin
  // (operator 403). Parcial: sólo los campos presentes. Unicidad de email por
  // tenant. Auditoría (sin PII). Sólo usuarios ACTIVOS (no archivados). Devuelve el
  // detalle enriquecido actualizado. organizationId/code/visitCount jamás del body.
  app.patch('/users/:code', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    if (!CAN_WRITE_USER_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para editar visitantes.' };
    }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const code = normalizeCodeForLookup((req.params as { code: string }).code);
    if (!isValidCode(code)) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }
    const parsed = AdminUserUpdateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
    }
    const patch = parsed.data;

    const target = await db.selectFrom('users').select(['id'])
      .where('organization_id', '=', orgId).where('code', '=', code).where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!target) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }

    // Unicidad de email por tenant (case-insensitive), excluyendo al propio y a archivados.
    if (patch.email) {
      const dup = await db.selectFrom('users').select('id')
        .where('organization_id', '=', orgId)
        .where('id', '!=', target.id)
        .where('deleted_at', 'is', null)
        .where(sql<boolean>`lower(btrim(users.email)) = lower(btrim(${patch.email}))`)
        .executeTakeFirst();
      if (dup) {
        reply.code(409);
        return { error: 'Ya existe un visitante con ese email.' };
      }
    }

    const set: { first_name?: string; last_name?: string; email?: string | null; phone?: string | null; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (patch.firstName !== undefined) set.first_name = patch.firstName;
    if (patch.lastName !== undefined) set.last_name = patch.lastName;
    if (patch.email !== undefined) set.email = patch.email; // null limpia
    if (patch.phone !== undefined) set.phone = patch.phone;

    const ip = req.ip ?? null;
    const ua = (req.headers['user-agent'] as string | undefined) ?? null;
    await withTenant(db, orgId, async (tx) => {
      await tx.updateTable('users').set(set).where('id', '=', target.id).where('organization_id', '=', orgId).execute();
      await writeUserAudit(tx, { orgId, staff: guard.ctx.staff, action: 'user.updated', targetUserId: target.id, metadata: { fields: Object.keys(patch) }, ip, ua });
    });

    const row = await db.selectFrom('users')
      .leftJoin(
        (eb) => eb.selectFrom('attendance')
          .select(['attendance.user_id'])
          .select((e) => e.fn.max('attendance.checked_in_at').as('last_visit_at'))
          .where('attendance.organization_id', '=', orgId)
          .where('attendance.checked_in_at', 'is not', null)
          .groupBy('attendance.user_id')
          .as('lv'),
        (join) => join.onRef('lv.user_id', '=', 'users.id'),
      )
      .select([...LIST_COLUMNS, 'lv.last_visit_at'])
      .where('users.id', '=', target.id)
      .executeTakeFirstOrThrow();
    const body: UserDetailResponse = { user: toListItem(row as ListRow) };
    return body;
    });
  });

  // POST /api/v2/users/:code/credential · reenviar credencial (UI-2 · F2C). Sólo
  // owner/admin. Exige email válido (422) e Idempotency-Key (400). Rate-limit por
  // tenant+actor+IP (429). Idempotencia transaccional (checkin_idempotency): misma
  // key → replay SIN reenviar. deliverCredential genera el PNG con el código exacto
  // y envía por Resend; en dry-run (sin RESEND_API_KEY) NO envía ni marca
  // credential_sent_at. Auditoría sin PII del visitante. Jamás envío masivo.
  app.post('/users/:code/credential', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    if (!CAN_WRITE_USER_ROLES.has(guard.ctx.staff.role)) {
      reply.code(403);
      return { error: 'No tenés permiso para reenviar credenciales.' };
    }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const staff = guard.ctx.staff;

    if ((await credLimiter.hit(`${orgId}:${staff.id}:${req.ip}`)).limited) {
      reply.code(429);
      return { error: 'Demasiados reenvíos. Esperá un momento e intentá de nuevo.' };
    }
    const key = String(req.headers['idempotency-key'] ?? '').trim();
    if (!key || key.length > 200) {
      reply.code(400);
      return { error: 'Falta el header Idempotency-Key (string del cliente).' };
    }
    const code = normalizeCodeForLookup((req.params as { code: string }).code);
    if (!isValidCode(code)) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }
    const user = await db.selectFrom('users').select(['id', 'code', 'email', 'first_name', 'last_name'])
      .where('organization_id', '=', orgId).where('code', '=', code).where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }
    if (!user.email) {
      reply.code(422);
      return { error: 'El visitante no tiene email; no se puede enviar la credencial.' };
    }

    // Claim idempotente (TTL 24h). Si la key existe y no expiró → replay (no reenvía).
    const claim = await withTenant(db, orgId, async (tx) => {
      const ttl = sql<string>`now() + interval '24 hours'`;
      const claimed = await tx.insertInto('checkin_idempotency')
        .values({ organization_id: orgId, endpoint: CRED_ENDPOINT, idempotency_key: key, attendance_id: user.id, expires_at: ttl })
        .onConflict((oc) => oc
          .columns(['organization_id', 'endpoint', 'idempotency_key'])
          .doUpdateSet({ attendance_id: user.id, expires_at: ttl })
          .where(sql<boolean>`checkin_idempotency.expires_at <= now()`))
        .returning('attendance_id')
        .executeTakeFirst();
      return { fresh: !!claimed };
    });

    const currentCredAt = async (): Promise<string | null> => {
      const u = await db.selectFrom('users').select('credential_sent_at').where('id', '=', user.id).executeTakeFirstOrThrow();
      return u.credential_sent_at ? toIso(u.credential_sent_at) : null;
    };

    if (!claim.fresh) {
      const body: AdminCredentialResendResponse = { result: 'replayed', credentialSentAt: await currentCredAt(), message: 'Ya procesado (no se reenvió).' };
      return body;
    }

    // Entrega real (fuera de tx): PNG + Resend + marca credential_sent_at sólo si sent.
    const result = await deliverCredential(db, orgId, { id: user.id, code: user.code, email: user.email, firstName: user.first_name, lastName: user.last_name }, {});
    let outcome: AdminCredentialResendResult;
    let message: string;
    if ('sent' in result && result.sent === true) { outcome = 'sent'; message = 'Credencial enviada al email del visitante.'; }
    else if ('skipped' in result && result.skipped && /RESEND/i.test(result.reason ?? '')) { outcome = 'dry-run'; message = 'Dry-run: sin clave de envío configurada, no se envió ni se marcó como enviada.'; }
    else if ('skipped' in result && result.skipped) { outcome = 'skipped'; message = `No se envió (${result.reason ?? 'omitido'}).`; }
    else { outcome = 'error'; message = 'No pudimos enviar la credencial. Intentá de nuevo.'; }

    await writeUserAudit(db, { orgId, staff, action: 'credential.resent', targetUserId: user.id, metadata: { result: outcome }, ip: req.ip, ua: req.headers['user-agent'] ?? null });

    const body: AdminCredentialResendResponse = { result: outcome, credentialSentAt: await currentCredAt(), message };
    return body;
    });
  });

  // POST /api/v2/users/:code/archive · soft-archive (UI-2 · F2D). Sólo owner/admin.
  // Set deleted_at = now(); JAMÁS hard-delete. Historial/asistencias se preservan.
  // Auditoría sin PII.
  app.post('/users/:code/archive', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!CAN_WRITE_USER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para archivar visitantes.' }; }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const code = normalizeCodeForLookup((req.params as { code: string }).code);
    if (!isValidCode(code)) { reply.code(404); return { error: 'Usuario no encontrado' }; }
    const user = await db.selectFrom('users').select(['id'])
      .where('organization_id', '=', orgId).where('code', '=', code).where('deleted_at', 'is', null).executeTakeFirst();
    if (!user) { reply.code(404); return { error: 'Usuario no encontrado' }; }
    const deletedAt = new Date().toISOString();
    await withTenant(db, orgId, async (tx) => {
      await tx.updateTable('users').set({ deleted_at: deletedAt, updated_at: deletedAt }).where('id', '=', user.id).where('organization_id', '=', orgId).execute();
      await writeUserAudit(tx, { orgId, staff: guard.ctx.staff, action: 'user.archived', targetUserId: user.id, ip: req.ip, ua: req.headers['user-agent'] ?? null });
    });
    const body: AdminUserArchiveResponse = { archived: true, deletedAt };
    return body;
    });
  });

  // POST /api/v2/users/:code/reactivate · reactivar un archivado (UI-2 · F2D). Sólo
  // owner/admin. Valida que el email no colisione con un visitante ACTIVO (409).
  app.post('/users/:code/reactivate', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) { reply.code(guard.status); return { error: guard.error }; }
    if (!CAN_WRITE_USER_ROLES.has(guard.ctx.staff.role)) { reply.code(403); return { error: 'No tenés permiso para reactivar visitantes.' }; }
    const orgId = guard.ctx.org.id;
    return withTenant(db, orgId, async (db) => {
    const code = normalizeCodeForLookup((req.params as { code: string }).code);
    if (!isValidCode(code)) { reply.code(404); return { error: 'Usuario no encontrado' }; }
    const user = await db.selectFrom('users').select(['id', 'email'])
      .where('organization_id', '=', orgId).where('code', '=', code).where('deleted_at', 'is not', null).executeTakeFirst();
    if (!user) { reply.code(404); return { error: 'Usuario archivado no encontrado' }; }
    if (user.email) {
      const dup = await db.selectFrom('users').select('id')
        .where('organization_id', '=', orgId).where('id', '!=', user.id).where('deleted_at', 'is', null)
        .where(sql<boolean>`lower(btrim(users.email)) = lower(btrim(${user.email}))`).executeTakeFirst();
      if (dup) { reply.code(409); return { error: 'Otro visitante activo ya usa ese email; no se puede reactivar.' }; }
    }
    const now = new Date().toISOString();
    await withTenant(db, orgId, async (tx) => {
      await tx.updateTable('users').set({ deleted_at: null, updated_at: now }).where('id', '=', user.id).where('organization_id', '=', orgId).execute();
      await writeUserAudit(tx, { orgId, staff: guard.ctx.staff, action: 'user.reactivated', targetUserId: user.id, ip: req.ip, ua: req.headers['user-agent'] ?? null });
    });
    const body: AdminUserArchiveResponse = { archived: false, deletedAt: null };
    return body;
    });
  });
};
