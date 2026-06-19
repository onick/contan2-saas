// apps/api-v2/test/team-actions.test.ts · integration (skip sin DATABASE_URL).
// F5 Equipo · PATCH /org/team/:id/role|status: invariantes RBAC (no auto-modificarse,
// solo owner asigna/modifica owner, owner/admin gate, operator 403), revoke de
// sesiones al suspender, auditoría, 401/cross-tenant/404.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('PATCH /org/team/:id (role|status)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `tw-a-${stamp}`;
  const slugB = `tw-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `tw-own-${stamp}`, admin: `tw-adm-${stamp}`, operator: `tw-ope-${stamp}`, b: `tw-b-${stamp}` };
  const id: Record<string, string> = {};
  const SESSION_OF_STATUS = `tw-mstatus-sess-${stamp}`;

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, key: string, role: 'owner' | 'admin' | 'operator', token?: string) => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${key}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${key}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    id[key] = s.id;
    if (token) await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    return s.id;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, 'owner1', 'owner', TOK.owner);
    await mkStaff(orgAId, 'owner2', 'owner'); // 2º owner (permite degradar a uno)
    await mkStaff(orgAId, 'admin', 'admin', TOK.admin);
    await mkStaff(orgAId, 'operator', 'operator', TOK.operator);
    await mkStaff(orgAId, 'mrole', 'operator'); // target: admin lo promueve a admin
    await mkStaff(orgAId, 'mstatus', 'operator', SESSION_OF_STATUS); // target: admin lo suspende (con sesión)
    await mkStaff(orgAId, 'mpromote', 'operator'); // target: owner lo promueve a owner
    await mkStaff(orgAId, 'mconsulta', 'operator'); // target: admin lo pasa a consulta (read-only)
    await mkStaff(orgBId, 'b', 'admin', TOK.b);
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const oid of [orgAId, orgBId]) {
      if (!oid) continue;
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in', (eb) => eb.selectFrom('staff_members').select('id').where('organization_id', '=', oid)).execute();
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', oid).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', oid).execute();
      await db.deleteFrom('organizations').where('id', '=', oid).execute();
    }
    await db.destroy();
  });

  const patchRole = (target: string, role: string, token?: string, host = hostA) =>
    app.inject({ method: 'PATCH', url: `/api/v2/org/team/${target}/role`, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: { role } });
  const patchStatus = (target: string, status: string, token?: string, host = hostA) =>
    app.inject({ method: 'PATCH', url: `/api/v2/org/team/${target}/status`, headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: { status } });

  it('admin promueve operator→admin (200) y suspende a otro (200 + revoca sesiones)', async () => {
    const r1 = await patchRole(id.mrole, 'admin', TOK.admin);
    expect(r1.statusCode).toBe(200);
    expect(r1.json().role).toBe('admin');

    const r2 = await patchStatus(id.mstatus, 'suspended', TOK.admin);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().status).toBe('suspended');
    // sesión del suspendido revocada
    const sess = await db.selectFrom('staff_auth_sessions').select('revoked_at').where('staff_member_id', '=', id.mstatus).executeTakeFirstOrThrow();
    expect(sess.revoked_at).not.toBeNull();
  });

  it('admin NO puede asignar owner ni modificar a un owner (403)', async () => {
    expect((await patchRole(id.mrole, 'owner', TOK.admin)).statusCode).toBe(403); // admin no asigna owner
    expect((await patchRole(id.owner2, 'admin', TOK.admin)).statusCode).toBe(403); // admin no modifica owner
    expect((await patchStatus(id.owner2, 'suspended', TOK.admin)).statusCode).toBe(403);
  });

  it('owner SÍ puede asignar owner y modificar a otro owner (hay 2 owners)', async () => {
    expect((await patchRole(id.mpromote, 'owner', TOK.owner)).json().role).toBe('owner'); // operator→owner
    const dem = await patchRole(id.owner2, 'admin', TOK.owner); // demota owner2 (quedan owner1+mpromote)
    expect(dem.statusCode).toBe(200);
    expect(dem.json().role).toBe('admin');
  });

  it('nadie se modifica a sí mismo (rol o estado) → 400', async () => {
    expect((await patchRole(id.admin, 'operator', TOK.admin)).statusCode).toBe(400);
    expect((await patchStatus(id.admin, 'suspended', TOK.admin)).statusCode).toBe(400);
  });

  it('operator no gestiona (403); sin sesión → 401; cross-tenant → 403; target inexistente → 404', async () => {
    expect((await patchStatus(id.mrole, 'suspended', TOK.operator)).statusCode).toBe(403);
    expect((await patchStatus(id.mrole, 'suspended')).statusCode).toBe(401);
    expect((await patchStatus(id.mrole, 'suspended', TOK.b)).statusCode).toBe(403);
    expect((await patchRole(randomUUID(), 'admin', TOK.admin)).statusCode).toBe(404);
  });

  it("admin asigna rol 'consulta' (solo lectura) → 200; persiste (CHECK migración 035)", async () => {
    const r = await patchRole(id.mconsulta, 'consulta', TOK.admin);
    expect(r.statusCode).toBe(200);
    expect(r.json().role).toBe('consulta');
    const row = await db.selectFrom('staff_members').select('role').where('id', '=', id.mconsulta).executeTakeFirstOrThrow();
    expect(row.role).toBe('consulta');
  });

  it('auditoría: role_changed/status_changed con actor enmascarado, sin PII', async () => {
    const row = await db.selectFrom('tenant_audit_log').selectAll().where('organization_id', '=', orgAId).where('action', '=', 'staff.role_changed').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(row.actor_email_masked).toMatch(/\*\*\*@/);
    expect(row.target_type).toBe('staff');
    const meta = typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata);
    expect(meta).toMatch(/from|to/);
    expect(meta).not.toMatch(/@t\.local/);
  });
});
