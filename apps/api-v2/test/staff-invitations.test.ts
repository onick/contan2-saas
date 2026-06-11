// apps/api-v2/test/staff-invitations.test.ts · integration (skip sin DATABASE_URL).
// Invitaciones S1: crear (owner-por-owner, 409 staff existente, reemplazo de
// pendiente), preview público (404/410), aceptar (crea staff activo que LOGUEA,
// one-shot), revoke/resend, operator 403, aislamiento de tenant.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { hashStaffPassword } from '../src/services/password.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('staff invitations · invitar/aceptar', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `inv-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  const hostB = `inv-b-${stamp}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `inv-owner-${stamp}`, admin: `inv-admin-${stamp}`, operator: `inv-oper-${stamp}` };

  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `${role}-${orgId.slice(0, 6)}-${stamp}@test.local`,
      password_hash: await hashStaffPassword('ClaveSegura!2026'), full_name: `S ${role}`, status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
    return s.id;
  };

  let ipSeq = 0;
  const call = (method: string, url: string, body?: unknown, token?: string, host = hostA) =>
    app.inject({
      method: method as 'POST', url,
      headers: {
        host, 'x-forwarded-for': `10.8.0.${(ipSeq++ % 250) + 1}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { cookie: `contan2_session=${token}` } : {}),
      },
      ...(body !== undefined ? { payload: body as object } : {}),
    });

  // Lee el token PLANO de una invitación generándolo nosotros y pisando el hash
  // (el server jamás lo expone; en producción viaja por email).
  const plantToken = async (invId: string) => {
    const plain = `t-${randomUUID().replace(/-/g, '')}`;
    await db.updateTable('staff_invitations').set({ token_hash: hashToken(plain) }).where('id', '=', invId).execute();
    return plain;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = (await db.insertInto('organizations').values({ slug: slugA, name: 'Org A', status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    orgBId = (await db.insertInto('organizations').values({ slug: `inv-b-${stamp}`, name: 'Org B', status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_invitations').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
        db.selectFrom('staff_members').select('id').where('organization_id', '=', id)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  it('admin invita → 201 + fila pendiente + audit; operator → 403; admin invitando OWNER → 403; owner sí puede', async () => {
    const r = await call('POST', '/api/v2/staff/invitations', { email: `nuevo-${stamp}@test.local`, role: 'operator' }, TOK.admin);
    expect(r.statusCode).toBe(201);
    expect(r.json().invitation.status).toBe('pending');

    expect((await call('POST', '/api/v2/staff/invitations', { email: `x-${stamp}@test.local`, role: 'operator' }, TOK.operator)).statusCode).toBe(403);
    expect((await call('POST', '/api/v2/staff/invitations', { email: `own-${stamp}@test.local`, role: 'owner' }, TOK.admin)).statusCode).toBe(403);
    expect((await call('POST', '/api/v2/staff/invitations', { email: `own-${stamp}@test.local`, role: 'owner' }, TOK.owner)).statusCode).toBe(201);

    const audit = await db.selectFrom('tenant_audit_log').select('id')
      .where('organization_id', '=', orgAId).where('action', '=', 'staff.invited').execute();
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('email de staff existente → 409; segunda invitación al mismo email revoca la primera', async () => {
    expect((await call('POST', '/api/v2/staff/invitations', { email: `owner-${orgAId.slice(0, 6)}-${stamp}@test.local`, role: 'admin' }, TOK.admin)).statusCode).toBe(409);

    const email = `dup-${stamp}@test.local`;
    const first = await call('POST', '/api/v2/staff/invitations', { email, role: 'operator' }, TOK.admin);
    const second = await call('POST', '/api/v2/staff/invitations', { email, role: 'admin' }, TOK.admin);
    expect(second.statusCode).toBe(201);
    const old = await db.selectFrom('staff_invitations').select('status')
      .where('id', '=', first.json().invitation.id).executeTakeFirstOrThrow();
    expect(old.status).toBe('revoked');
  });

  it('preview público: pendiente → datos; revocada → 410; token inventado → 404; host de otro tenant → 404', async () => {
    const created = await call('POST', '/api/v2/staff/invitations', { email: `prev-${stamp}@test.local`, fullName: 'Prev Uno', role: 'operator' }, TOK.admin);
    const invId = created.json().invitation.id;
    const plain = await plantToken(invId);

    const prev = await call('GET', `/api/v2/auth/invitation/${plain}`);
    expect(prev.statusCode).toBe(200);
    expect(prev.json().invitation.email).toBe(`prev-${stamp}@test.local`);
    expect(prev.json().invitation.organization.name).toBe('Org A');

    expect((await call('GET', `/api/v2/auth/invitation/${plain}`, undefined, undefined, hostB)).statusCode).toBe(404);
    expect((await call('GET', `/api/v2/auth/invitation/tok-inventado-${stamp}xxxx`)).statusCode).toBe(404);

    await call('POST', `/api/v2/staff/invitations/${invId}/revoke`, {}, TOK.admin);
    expect((await call('GET', `/api/v2/auth/invitation/${plain}`)).statusCode).toBe(410);
  });

  it('aceptar: crea staff ACTIVO que puede loguear; el token es one-shot; password débil → 400', async () => {
    const email = `acc-${stamp}@test.local`;
    const created = await call('POST', '/api/v2/staff/invitations', { email, role: 'admin' }, TOK.owner);
    const plain = await plantToken(created.json().invitation.id);

    expect((await call('POST', '/api/v2/auth/accept-invitation', { token: plain, password: 'corta' })).statusCode).toBe(400);

    const acc = await call('POST', '/api/v2/auth/accept-invitation', { token: plain, password: 'ClaveNueva!2026', fullName: 'Acep Tada' });
    expect(acc.statusCode).toBe(201);

    // El nuevo staff loguea de una.
    const login = await call('POST', '/api/v2/auth/login', { email, password: 'ClaveNueva!2026', rememberMe: false });
    expect(login.statusCode).toBe(200);
    expect(login.json().staff.role).toBe('admin');

    // one-shot
    expect((await call('POST', '/api/v2/auth/accept-invitation', { token: plain, password: 'OtraClave!2026' })).statusCode).toBe(410);
  });

  it('resend regenera el token (el viejo deja de servir); expirada → 410 al aceptar', async () => {
    const created = await call('POST', '/api/v2/staff/invitations', { email: `rs-${stamp}@test.local`, role: 'operator' }, TOK.admin);
    const invId = created.json().invitation.id;
    const oldPlain = await plantToken(invId);
    expect((await call('POST', `/api/v2/staff/invitations/${invId}/resend`, {}, TOK.admin)).statusCode).toBe(200);
    expect((await call('GET', `/api/v2/auth/invitation/${oldPlain}`)).statusCode).toBe(404); // token viejo muerto

    // expirada
    const exp = await call('POST', '/api/v2/staff/invitations', { email: `exp-${stamp}@test.local`, role: 'operator' }, TOK.admin);
    const expId = exp.json().invitation.id;
    const expPlain = await plantToken(expId);
    await db.updateTable('staff_invitations').set({ expires_at: new Date(Date.now() - 1000).toISOString() }).where('id', '=', expId).execute();
    expect((await call('POST', '/api/v2/auth/accept-invitation', { token: expPlain, password: 'ClaveNueva!2026' })).statusCode).toBe(410);
  });
});
