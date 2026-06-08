import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import { normalizeCodeForLookup, isValidCode } from '@contan2/codes';
import type { User, UsersListResponse, UserDetailResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { parsePage, parseSearch, likeContains } from '../query.js';

const COLUMNS = ['id', 'code', 'first_name', 'last_name', 'email', 'phone', 'visit_count', 'created_at'] as const;

// Forma de la fila proyectada (snake_case, igual que la DB). created_at llega
// como Date desde Kysely.
interface UserRow {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  visit_count: number;
  created_at: Date;
}

// Proyección snake_case → camelCase. PII real (email/phone) para staff
// autenticado del MISMO tenant; la frontera es la sesión + cross-tenant check.
function toUser(r: UserRow): User {
  return {
    id: r.id,
    code: r.code,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    visitCount: r.visit_count,
    createdAt: r.created_at.toISOString(),
  };
}

// GET /api/v2/users (listado) y GET /api/v2/users/:code (detalle por código).
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

    // Filtro tenant-scoped + búsqueda (código/nombre/apellido/email, ILIKE). El
    // MISMO `where` se aplica al listado y al count → `total` refleja los filtros.
    // organizationId SIEMPRE del guard (sesión), nunca del cliente.
    let rowsQ = db.selectFrom('users').select(COLUMNS).where('organization_id', '=', orgId);
    let countQ = db
      .selectFrom('users')
      .select(db.fn.countAll<string>().as('n'))
      .where('organization_id', '=', orgId);
    if (pattern) {
      rowsQ = rowsQ.where((eb) =>
        eb.or([
          eb('code', 'ilike', pattern),
          eb('first_name', 'ilike', pattern),
          eb('last_name', 'ilike', pattern),
          eb('email', 'ilike', pattern),
        ]),
      );
      countQ = countQ.where((eb) =>
        eb.or([
          eb('code', 'ilike', pattern),
          eb('first_name', 'ilike', pattern),
          eb('last_name', 'ilike', pattern),
          eb('email', 'ilike', pattern),
        ]),
      );
    }

    const [rows, count] = await Promise.all([
      // Orden determinista: created_at desc, desempate por id desc (sin saltos ni
      // solapamientos entre páginas con created_at iguales).
      rowsQ.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).offset(offset).execute(),
      countQ.executeTakeFirstOrThrow(),
    ]);

    const body: UsersListResponse = {
      items: rows.map(toUser),
      total: Number(count.n),
      limit,
      offset,
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

    const row = await db.selectFrom('users').select(COLUMNS)
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
