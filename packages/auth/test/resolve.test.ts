// packages/auth/test/resolve.test.ts · integration (skip sin DATABASE_URL).
// Self-contained: inserta org + staff + sesiones throwaway, ejercita los
// casos, limpia. No depende de seed-test-fixtures.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken, resolveStaffSession } from '../src/index.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('resolveStaffSession · paridad con v1', () => {
  let db: Kysely<Database>;
  let orgId: string;
  let staffActiveId: string;
  let staffSuspendedId: string;
  let staffDeletedId: string;

  const T = {
    valid: 'authtest-valid-token',
    revoked: 'authtest-revoked-token',
    expired: 'authtest-expired-token',
    suspended: 'authtest-suspended-token',
    deleted: 'authtest-deleted-token',
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);

    const org = await db
      .insertInto('organizations')
      .values({ slug: `authtest-${Date.now()}`, name: 'Auth Test Org' })
      .returning('id')
      .executeTakeFirstOrThrow();
    orgId = org.id;

    const stamp = Date.now();
    const mkStaff = async (
      status: 'active' | 'suspended',
      deleted: boolean,
      tag: string,
    ): Promise<string> => {
      const r = await db
        .insertInto('staff_members')
        .values({
          organization_id: orgId,
          email: `authtest-${tag}-${stamp}@test.local`,
          password_hash: 'x',
          full_name: 'Auth Test',
          status,
          role: 'operator',
          ...(deleted ? { deleted_at: new Date().toISOString() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return r.id;
    };
    staffActiveId = await mkStaff('active', false, 'active');
    staffSuspendedId = await mkStaff('suspended', false, 'suspended');
    staffDeletedId = await mkStaff('active', true, 'deleted');

    const future = new Date(Date.now() + 3_600_000).toISOString();
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const mkSession = async (
      staffId: string,
      token: string,
      opts: { expires?: string; revoked?: boolean } = {},
    ): Promise<void> => {
      await db
        .insertInto('staff_auth_sessions')
        .values({
          staff_member_id: staffId,
          token_hash: hashToken(token),
          expires_at: opts.expires ?? future,
          remember_me: false,
          ...(opts.revoked ? { revoked_at: new Date().toISOString() } : {}),
        })
        .execute();
    };
    await mkSession(staffActiveId, T.valid);
    await mkSession(staffActiveId, T.revoked, { revoked: true });
    await mkSession(staffActiveId, T.expired, { expires: past });
    await mkSession(staffSuspendedId, T.suspended);
    await mkSession(staffDeletedId, T.deleted);
  });

  afterAll(async () => {
    if (orgId) {
      // staff_auth_sessions → staff_members es CASCADE; staff_members → org
      // es RESTRICT, así que borramos staff (cascadea sesiones) y luego org.
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  it('token inexistente → null', async () => {
    expect(await resolveStaffSession(db, 'no-such-token')).toBeNull();
  });

  it('sesión válida + staff active → { staff, sessionId }', async () => {
    const r = await resolveStaffSession(db, T.valid);
    expect(r).not.toBeNull();
    expect(r?.staff.id).toBe(staffActiveId);
    expect(r?.staff.status).toBe('active');
    expect(typeof r?.sessionId).toBe('string');
  });

  it('sesión revocada → null', async () => {
    expect(await resolveStaffSession(db, T.revoked)).toBeNull();
  });

  it('sesión expirada → null', async () => {
    expect(await resolveStaffSession(db, T.expired)).toBeNull();
  });

  it('staff suspended → null (401 en el endpoint)', async () => {
    expect(await resolveStaffSession(db, T.suspended)).toBeNull();
  });

  it('staff deleted → null', async () => {
    expect(await resolveStaffSession(db, T.deleted)).toBeNull();
  });

  it('cross-tenant prep · organizationId distinto → null', async () => {
    const r = await resolveStaffSession(db, T.valid, {
      organizationId: '00000000-0000-0000-0000-0000000000ff',
    });
    expect(r).toBeNull();
  });

  it('publicStaff · 10 keys exactas de v1', async () => {
    const r = await resolveStaffSession(db, T.valid);
    expect(Object.keys(r!.staff).sort()).toEqual([
      'createdAt', 'email', 'fullName', 'id', 'lastLoginAt', 'mfaEnabled',
      'mustChangePassword', 'organizationId', 'role', 'status',
    ]);
  });
});

describe('hashToken · compatibilidad con v1', () => {
  it('sha256 hex de un token conocido', () => {
    // sha256('test') — debe coincidir con el hashToken de v1.
    expect(hashToken('test')).toBe(
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    );
  });
});
