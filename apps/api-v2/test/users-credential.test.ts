// apps/api-v2/test/users-credential.test.ts · integration (skip sin DATABASE_URL).
// F2C: POST /api/v2/users/:code/credential · reenviar credencial. Sin RESEND_API_KEY
// → DRY-RUN (no envía, NO marca credential_sent_at). Idempotencia, rate-limit, roles.

process.env.ROOT_DOMAIN = 'contan2.com';
delete process.env.RESEND_API_KEY; // fuerza dry-run

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { AdminCredentialResendResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('users · reenviar credencial (POST) F2C · dry-run', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `cred-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string; let orgBId: string;
  const TOK = { owner: `cred-own-${stamp}`, op: `cred-op-${stamp}`, b: `cred-b-${stamp}` };
  const CODE = 'CCB-CRD001';
  const CODE_NOMAIL = 'CCB-CRD002';

  const mkOrg = async (slug: string) => (await db.insertInto('organizations').values({ slug, name: slug, status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 6)}-${stamp}@t.local`, password_hash: 'x', full_name: role, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgAId = await mkOrg(slugA); orgBId = await mkOrg(`cred-b-${stamp}`);
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.op, 'operator');
    await mkStaff(orgBId, TOK.b, 'owner');
    await db.insertInto('users').values([
      { id: randomUUID(), organization_id: orgAId, code: CODE, first_name: 'Ana', last_name: 'Pérez', email: 'ana@ccb.do', phone: null, visit_count: 1, credential_sent_at: null },
      { id: randomUUID(), organization_id: orgAId, code: CODE_NOMAIL, first_name: 'Sin', last_name: 'Mail', email: null, phone: null, visit_count: 1 },
    ]).execute();
    app = buildApp(); await app.ready();
  });
  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      await db.deleteFrom('checkin_idempotency').where('organization_id', '=', id).execute();
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const post = (code: string, key: string | null, token = TOK.owner, host = hostA) =>
    app.inject({ method: 'POST', url: `/api/v2/users/${code}/credential`, headers: { host, ...(key ? { 'idempotency-key': key } : {}) }, cookies: { contan2_session: token } });

  it('owner · dry-run: result=dry-run, NO marca credential_sent_at, audit sin PII', async () => {
    const res = await post(CODE, 'k-1');
    expect(res.statusCode).toBe(200);
    const body = AdminCredentialResendResponseSchema.parse(res.json());
    expect(body.result).toBe('dry-run');
    expect(body.credentialSentAt).toBeNull(); // dry-run NO marca
    const u = await db.selectFrom('users').select('credential_sent_at').where('code', '=', CODE).where('organization_id', '=', orgAId).executeTakeFirstOrThrow();
    expect(u.credential_sent_at).toBeNull();
    const audit = await db.selectFrom('tenant_audit_log').selectAll().where('organization_id', '=', orgAId).where('action', '=', 'credential.resent').executeTakeFirstOrThrow();
    expect(audit.target_type).toBe('user');
    expect(audit.actor_email_masked).toMatch(/\*\*\*@/);
    expect(String(audit.metadata)).not.toMatch(/ana@ccb/); // sin email del visitante
  });

  it('misma Idempotency-Key → replayed (no reenvía)', async () => {
    const body = AdminCredentialResendResponseSchema.parse((await post(CODE, 'k-1')).json());
    expect(body.result).toBe('replayed');
  });

  it('sin email → 422', async () => {
    expect((await post(CODE_NOMAIL, 'k-2')).statusCode).toBe(422);
  });

  it('falta Idempotency-Key → 400; código inexistente → 404', async () => {
    expect((await post(CODE, null)).statusCode).toBe(400);
    expect((await post('CCB-ZZZ999', 'k-3')).statusCode).toBe(404);
  });

  it('operator 403; cross-tenant 403; sin sesión 401 (sin consumir rate-limit de orgA)', async () => {
    expect((await post(CODE, 'k-op', TOK.op)).statusCode).toBe(403);
    expect((await post(CODE, 'k-x', TOK.b)).statusCode).toBe(403);
    const noAuth = await app.inject({ method: 'POST', url: `/api/v2/users/${CODE}/credential`, headers: { host: hostA, 'idempotency-key': 'k-n' } });
    expect(noAuth.statusCode).toBe(401);
  });

  it('rate-limit: el 6º reenvío del mismo actor → 429', async () => {
    // ya van 5 hits de owner en orgA (dry-run, replay, 422, 400, 404) → el 6º limita.
    expect((await post(CODE, 'k-6')).statusCode).toBe(429);
  });
});
