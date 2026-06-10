// apps/api-v2/test/credentials-bulk.test.ts · integration (skip sin DATABASE_URL).
// Bulk-send S1 (paridad v1): por códigos (formato inválido / not-found / sin
// email / dry-run) y por cohorte noCredential; operator 403; en dry-run NO se
// marca credential_sent_at y el summary lo declara.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';
delete process.env.RESEND_API_KEY; // fuerza dry-run

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { BulkCredentialsResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('POST /credentials/bulk-send', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `bulk-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  const TOK = { admin: `bulk-admin-${stamp}`, operator: `bulk-oper-${stamp}` };

  const mkStaff = async (token: string, role: 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgAId, email: `${role}-${stamp}@test.local`, password_hash: 'x',
      full_name: 'S', status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };
  const mkUser = async (over: Record<string, unknown> = {}) => {
    const code = `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase().replace(/[ILOU]/g, 'X')}`;
    await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgAId, code, first_name: 'B', last_name: 'U',
      email: null, phone: null, visit_count: 0, ...over,
    } as never).execute();
    return code;
  };

  const post = (body: unknown, token?: string) =>
    app.inject({
      method: 'POST', url: '/api/v2/credentials/bulk-send',
      headers: { host: hostA, 'content-type': 'application/json', ...(token ? { cookie: `contan2_session=${token}` } : {}) },
      payload: body as object,
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = (await db.insertInto('organizations').values({ slug: slugA, name: 'Org A', status: 'active' })
      .returning('id').executeTakeFirstOrThrow()).id;
    await mkStaff(TOK.admin, 'admin');
    await mkStaff(TOK.operator, 'operator');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('users').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
      db.selectFrom('staff_members').select('id').where('organization_id', '=', orgAId)).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgAId).execute();
    await db.destroy();
  });

  it('por códigos: dry-run para con-email, skipped sin-email, not-found e invalid-format; sin marcar sent_at', async () => {
    const withEmail = await mkUser({ email: `b1-${stamp}@test.local` });
    const noEmail = await mkUser();

    const res = await post({ codes: [withEmail, noEmail, 'CCB-ZZZZ99', 'malformato'], throttleMs: 0 }, TOK.admin);
    expect(res.statusCode).toBe(200);
    const { summary, results } = BulkCredentialsResponseSchema.parse(res.json());
    expect(summary).toEqual({ total: 4, sent: 1, skipped: 1, failed: 2, dryRun: true });
    const byCode = Object.fromEntries(results.map((r) => [r.code, r.status]));
    expect(byCode[withEmail]).toBe('dry-run');
    expect(byCode[noEmail]).toBe('skipped');
    expect(byCode['CCB-ZZZZ99']).toBe('not-found');
    expect(byCode['MALFORMATO']).toBe('invalid-format');

    // dry-run NO marca credential_sent_at (paridad con el envío individual).
    const u = await db.selectFrom('users').select('credential_sent_at')
      .where('code', '=', withEmail).executeTakeFirstOrThrow();
    expect(u.credential_sent_at).toBeNull();
  });

  it('cohorte noCredential: toma con-email-sin-enviar; excluye ya-enviadas y archivados', async () => {
    const pending = await mkUser({ email: `b2-${stamp}@test.local` });
    await mkUser({ email: `b3-${stamp}@test.local`, credential_sent_at: new Date().toISOString() }); // ya enviada
    await mkUser({ email: `b4-${stamp}@test.local`, deleted_at: new Date().toISOString() }); // archivado

    const res = await post({ cohort: 'noCredential', throttleMs: 0 }, TOK.admin);
    expect(res.statusCode).toBe(200);
    const { results } = BulkCredentialsResponseSchema.parse(res.json());
    const codes = results.map((r) => r.code);
    expect(codes).toContain(pending);
    expect(codes.every((c) => c !== 'b3')).toBe(true);
    // todos los objetivo tienen email → ninguno 'skipped'
    expect(results.every((r) => r.status === 'dry-run')).toBe(true);
  });

  it('operator → 403; sin cookie → 401; body inválido → 400', async () => {
    expect((await post({ codes: ['CCB-AAAAAA'] }, TOK.operator)).statusCode).toBe(403);
    expect((await post({ codes: ['CCB-AAAAAA'] })).statusCode).toBe(401);
    expect((await post({ nada: true }, TOK.admin)).statusCode).toBe(400);
    expect((await post({ codes: [] }, TOK.admin)).statusCode).toBe(400);
  });
});
