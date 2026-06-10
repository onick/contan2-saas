// apps/api-v2/test/users-create.test.ts · integration (skip sin DATABASE_URL).
// S1 · POST /users (alta de visitante desde el padrón, paridad v1): código generado
// con el code_prefix REAL del tenant (continuidad de credenciales), visit_count=0,
// email único por tenant (409), TODOS los roles staff pueden (operator incluido,
// paridad v1 requireStaffSession), 401/cross-tenant, credencial dry-run si trae
// email / skipped si no, auditoría user.created sin PII.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { CODE_RE } from '@contan2/codes';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('POST /users · alta de visitante', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `uc-a-${stamp}`;
  const slugB = `uc-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `uc-own-${stamp}`, admin: `uc-adm-${stamp}`, operator: `uc-ope-${stamp}`, b: `uc-b-${stamp}` };

  const mkOrg = async (slug: string, prefix: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: prefix }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, 'UCA');
    orgBId = await mkOrg(slugB, 'UCB');
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const post = (body: unknown, token?: string, host = hostA) =>
    app.inject({ method: 'POST', url: '/api/v2/users', headers: { host, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) }, payload: body as object });

  it('crea visitante → 201, código con el prefix REAL del tenant, visit_count=0, credencial dry-run', async () => {
    const res = await post({ firstName: 'Eva', lastName: 'Torres', email: `eva-${stamp}@uc.do`, phone: '809-1' }, TOK.admin);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.code).toMatch(CODE_RE);
    expect(body.user.code.startsWith('UCA-')).toBe(true); // prefix del tenant, no el fallback CCB
    expect(body.credential).toBe('dry-run'); // sin RESEND_API_KEY en test
    const row = await db.selectFrom('users').select(['visit_count', 'email', 'credential_sent_at']).where('id', '=', body.user.id).executeTakeFirstOrThrow();
    expect(Number(row.visit_count)).toBe(0);
    expect(row.email).toBe(`eva-${stamp}@uc.do`);
    expect(row.credential_sent_at).toBeNull(); // dry-run NO marca
  });

  it('sin email → 201 con credential=skipped', async () => {
    const res = await post({ firstName: 'Sin', lastName: 'Correo' }, TOK.admin);
    expect(res.statusCode).toBe(201);
    expect(res.json().credential).toBe('skipped');
  });

  it('email duplicado en el tenant → 409 (y no crea)', async () => {
    const before = Number((await db.selectFrom('users').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).executeTakeFirstOrThrow()).n);
    const res = await post({ firstName: 'Dup', lastName: 'Licada', email: `eva-${stamp}@uc.do` }, TOK.admin);
    expect(res.statusCode).toBe(409);
    const after = Number((await db.selectFrom('users').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).executeTakeFirstOrThrow()).n);
    expect(after).toBe(before); // rollback: no quedó el usuario
  });

  it('roles: owner, admin Y operator pueden crear (paridad v1)', async () => {
    for (const [i, t] of [TOK.owner, TOK.admin, TOK.operator].entries()) {
      const res = await post({ firstName: 'Rol', lastName: `Caso${i}` }, t);
      expect(res.statusCode).toBe(201);
    }
  });

  it('sin sesión → 401; cross-tenant (admin B en host A) → 403; body inválido → 400', async () => {
    expect((await post({ firstName: 'X', lastName: 'Y' })).statusCode).toBe(401);
    expect((await post({ firstName: 'X', lastName: 'Y' }, TOK.b)).statusCode).toBe(403);
    expect((await post({ firstName: '', lastName: 'Y' }, TOK.admin)).statusCode).toBe(400);
    expect((await post({ firstName: 'X', lastName: 'Y', code: 'UCA-HACK01' }, TOK.admin)).statusCode).toBe(400); // strict: code jamás del cliente
  });

  it('auditoría user.created: actor enmascarado, metadata sin PII (solo flags)', async () => {
    const row = await db.selectFrom('tenant_audit_log').selectAll()
      .where('organization_id', '=', orgAId).where('action', '=', 'user.created')
      .orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(row.actor_email_masked).toMatch(/\*\*\*@/);
    expect(row.target_type).toBe('user');
    const meta = typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata);
    expect(meta).toContain('hasEmail');
    expect(meta).not.toMatch(/@uc\.do/); // jamás el email del visitante
  });
});
