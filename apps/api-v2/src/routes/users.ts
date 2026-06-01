import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '@contan2/db';
import { normalizeCodeForLookup, isValidCode } from '@contan2/codes';
import type { User, UsersListResponse, UserDetailResponse } from '@contan2/contracts';
import { requireTenantStaff } from '../guard.js';
import { parsePage } from '../query.js';

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
    const { limit, offset } = parsePage((req.query ?? {}) as Record<string, unknown>);

    const [rows, count] = await Promise.all([
      db.selectFrom('users').select(COLUMNS)
        .where('organization_id', '=', orgId)
        .orderBy('created_at', 'desc').limit(limit).offset(offset).execute(),
      db.selectFrom('users').select(db.fn.countAll<string>().as('n'))
        .where('organization_id', '=', orgId).executeTakeFirstOrThrow(),
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
