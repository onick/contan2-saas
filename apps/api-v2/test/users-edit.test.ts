// apps/api-v2/test/users-edit.test.ts · integration (skip sin DATABASE_URL).
// F2B: PATCH /api/v2/users/:code · editar visitante. owner/admin sí, operator 403.
// Unicidad de email, validación, strict, auditoría sin PII, tenant isolation.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { UserDetailResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('users · editar (PATCH) F2B', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `edit-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string; let orgBId: string;
  const TOK = { owner: `edit-own-${stamp}`, op: `edit-op-${stamp}`, b: `edit-b-${stamp}` };

  const mkOrg = async (slug: string) => (await db.insertInto('organizations').values({ slug, name: slug, status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 6)}-${stamp}@t.local`, password_hash: 'x', full_name: role, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgAId = await mkOrg(slugA); orgBId = await mkOrg(`edit-b-${stamp}`);
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.op, 'operator');
    await mkStaff(orgBId, TOK.b, 'owner');
    await db.insertInto('users').values([
      { id: randomUUID(), organization_id: orgAId, code: 'CCB-EDT001', first_name: 'Ana', last_name: 'Pérez', email: 'ana@ccb.do', phone: '809-1', visit_count: 1 },
      { id: randomUUID(), organization_id: orgAId, code: 'CCB-EDT002', first_name: 'Luis', last_name: 'Gómez', email: 'luis@ccb.do', phone: null, visit_count: 1 },
    ]).execute();
    app = buildApp(); await app.ready();
  });
  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const patch = (code: string, body: unknown, token = TOK.owner, host = hostA) =>
    app.inject({ method: 'PATCH', url: `/api/v2/users/${code}`, headers: { host, 'content-type': 'application/json' }, cookies: { contan2_session: token }, payload: JSON.stringify(body) });

  it('owner edita nombre + teléfono → 200 + detalle enriquecido actualizado', async () => {
    const res = await patch('CCB-EDT001', { firstName: 'Ana María', phone: '809-555-9999' });
    expect(res.statusCode).toBe(200);
    const { user } = UserDetailResponseSchema.parse(res.json());
    expect(user.firstName).toBe('Ana María');
    expect(user.phone).toBe('809-555-9999');
    expect(user).toHaveProperty('lastVisitAt'); // enriquecido
  });

  it('operator → 403 (no puede editar)', async () => {
    expect((await patch('CCB-EDT001', { firstName: 'X' }, TOK.op)).statusCode).toBe(403);
  });

  it('email duplicado en el tenant → 409', async () => {
    expect((await patch('CCB-EDT002', { email: 'ana@ccb.do' })).statusCode).toBe(409);
  });

  it('email inválido → 400; clave no editable (strict) → 400; body vacío → 400', async () => {
    expect((await patch('CCB-EDT001', { email: 'no-es-email' })).statusCode).toBe(400);
    expect((await patch('CCB-EDT001', { code: 'CCB-HACK01' })).statusCode).toBe(400);
    expect((await patch('CCB-EDT001', { visitCount: 99 })).statusCode).toBe(400);
    expect((await patch('CCB-EDT001', {})).statusCode).toBe(400);
  });

  it('limpiar email (null) y código inexistente 404', async () => {
    expect((await patch('CCB-EDT002', { email: null })).statusCode).toBe(200);
    const { user } = UserDetailResponseSchema.parse((await patch('CCB-EDT002', { phone: '809-x' })).json());
    expect(user.email).toBeNull();
    expect((await patch('CCB-ZZZ999', { firstName: 'X' })).statusCode).toBe(404);
  });

  it('auditoría: registra user.updated con email del actor enmascarado, sin PII del visitante', async () => {
    await patch('CCB-EDT001', { lastName: 'Editado' });
    const row = await db.selectFrom('tenant_audit_log').selectAll()
      .where('organization_id', '=', orgAId).where('action', '=', 'user.updated')
      .orderBy('created_at', 'desc').executeTakeFirstOrThrow();
    expect(row.target_type).toBe('user');
    expect(row.actor_email_masked).toMatch(/\*\*\*@/); // enmascarado
    expect(String(row.metadata)).not.toMatch(/@/); // metadata sólo nombres de campos, sin emails
  });

  it('tenant isolation: cross-tenant 403; sin sesión 401', async () => {
    expect((await patch('CCB-EDT001', { firstName: 'X' }, TOK.b)).statusCode).toBe(403);
    const noAuth = await app.inject({ method: 'PATCH', url: '/api/v2/users/CCB-EDT001', headers: { host: hostA, 'content-type': 'application/json' }, payload: '{"firstName":"X"}' });
    expect(noAuth.statusCode).toBe(401);
  });
});
