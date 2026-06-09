import type { FastifyPluginAsync } from 'fastify';
import { getDb, sql } from '@contan2/db';
import { normalizeCodeForLookup, isValidCode } from '@contan2/codes';
import type {
  User, UserListItem, UserActivityStatus, UserCohort,
  UsersListResponse, UsersFacetsResponse, UserDetailResponse,
} from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { parsePage, parseSearch, parseCohort, likeContains } from '../query.js';

// Detalle (UserSchema crudo, sin enriquecimiento). Una sola tabla → sin join.
const DETAIL_COLUMNS = ['id', 'code', 'first_name', 'last_name', 'email', 'phone', 'visit_count', 'created_at'] as const;
// Listado: columnas calificadas (hay join con el agregado de última visita).
const LIST_COLUMNS = [
  'users.id', 'users.code', 'users.first_name', 'users.last_name', 'users.email',
  'users.phone', 'users.visit_count', 'users.created_at', 'users.credential_sent_at',
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
  last_visit_at: Date | string | null;
}
function toListItem(r: ListRow): UserListItem {
  const lastVisit = r.last_visit_at ? new Date(r.last_visit_at) : null;
  return {
    ...toUser(r),
    lastVisitAt: lastVisit ? lastVisit.toISOString() : null,
    credentialSentAt: r.credential_sent_at ? toIso(r.credential_sent_at) : null,
    status: deriveStatus(lastVisit),
  };
}

// Condición SQL de cohorte (null = 'all', sin filtro). Las cohortes de actividad
// (active/dormant) referencian el alias `lv.last_visit_at` del join.
function cohortCondition(cohort: UserCohort) {
  switch (cohort) {
    case 'frequent': return sql<boolean>`users.visit_count >= 3`;
    case 'new7d': return sql<boolean>`users.created_at >= now() - interval '7 days'`;
    case 'noEmail': return sql<boolean>`users.email is null`;
    case 'noCredential': return sql<boolean>`users.email is not null and users.credential_sent_at is null`;
    case 'active': return sql<boolean>`lv.last_visit_at >= now() - interval '30 days'`;
    case 'dormant': return sql<boolean>`lv.last_visit_at is null or lv.last_visit_at < now() - interval '90 days'`;
    default: return null;
  }
}

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
    const query = (req.query ?? {}) as Record<string, unknown>;
    const search = parseSearch(query.q);
    if (search.error) {
      reply.code(400);
      return { error: 'Parámetro de búsqueda inválido.' };
    }
    const pattern = search.q ? likeContains(search.q) : undefined;

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

  app.get('/users/:code', async (req, reply) => {
    const db = getDb();
    const guard = await requireTenantStaff(db, req);
    if (!guard.ok) {
      reply.code(guard.status);
      return { error: guard.error };
    }
    const orgId = guard.ctx.org.id;

    // Normaliza igual que el check-in v1 (trim + uppercase) vía @contan2/codes.
    const code = normalizeCodeForLookup((req.params as { code: string }).code);
    if (!isValidCode(code)) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }

    const row = await db.selectFrom('users').select(DETAIL_COLUMNS)
      .where('organization_id', '=', orgId)
      .where('code', '=', code)
      .executeTakeFirst();
    if (!row) {
      reply.code(404);
      return { error: 'Usuario no encontrado' };
    }

    const body: UserDetailResponse = { user: toUser(row) };
    return body;
  });
};
