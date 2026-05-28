// apps/api-v2/test/auth-me.test.ts · integration (skip sin DATABASE_URL).
// Verifica el endpoint GET /api/v2/auth/me end-to-end con cookie real.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('GET /api/v2/auth/me', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  let orgId: string;
  let staffId: string;

  const T = { valid: 'authme-valid-token', revoked: 'authme-revoked-token' };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    const org = await db
      .insertInto('organizations')
      .values({ slug: `authme-${Date.now()}`, name: 'AuthMe Org' })
      .returning('id')
      .executeTakeFirstOrThrow();
    orgId = org.id;

    const staff = await db
      .insertInto('staff_members')
      .values({
        organization_id: orgId,
        email: `authme-${Date.now()}@test.local`,
        password_hash: 'x',
        full_name: 'AuthMe Staff',
        status: 'active',
        role: 'admin',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    staffId = staff.id;

    const future = new Date(Date.now() + 3_600_000).toISOString();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: staffId,
      token_hash: hashToken(T.valid),
      expires_at: future,
      remember_me: false,
    }).execute();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: staffId,
      token_hash: hashToken(T.revoked),
      expires_at: future,
      remember_me: false,
      revoked_at: new Date().toISOString(),
    }).execute();

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) {
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  it('sin cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('cookie inválida → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      cookies: { contan2_session: 'no-such-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('sesión revocada → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      cookies: { contan2_session: T.revoked },
    });
    expect(res.statusCode).toBe(401);
  });

  it('sesión válida → 200 + payload publicStaff', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      cookies: { contan2_session: T.valid },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { staff: Record<string, unknown>; sessionId: string };
    expect(body.staff.id).toBe(staffId);
    expect(body.staff.organizationId).toBe(orgId);
    expect(body.staff.role).toBe('admin');
    expect(body.staff.status).toBe('active');
    expect(typeof body.sessionId).toBe('string');
    expect(Object.keys(body.staff).sort()).toEqual([
      'createdAt', 'email', 'fullName', 'id', 'lastLoginAt', 'mfaEnabled',
      'mustChangePassword', 'organizationId', 'role', 'status',
    ]);
  });
});
