// packages/auth/test/session-write.test.ts · integration (skip sin DATABASE_URL).
// Escritura de sesiones (login/logout) byte-compatible con v1, e INTEROP: una
// sesión creada por createStaffSession valida con validateStaffSession (el mismo
// validador que ya usa v1↔v2). Self-contained: org + staff throwaway, limpia.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import {
  createStaffSession,
  revokeStaffSession,
  validateStaffSession,
  hashToken,
  SESSION_TTL_MS,
  SESSION_REMEMBER_TTL_MS,
} from '../src/index.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('session-write · createStaffSession / revokeStaffSession (byte-compat v1)', () => {
  let db: Kysely<Database>;
  let orgId: string;
  let staffId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const org = await db
      .insertInto('organizations')
      .values({ slug: `swtest-${Date.now()}`, name: 'Session Write Test' })
      .returning('id')
      .executeTakeFirstOrThrow();
    orgId = org.id;
    const staff = await db
      .insertInto('staff_members')
      .values({
        organization_id: orgId,
        email: `swtest-${Date.now()}@test.local`,
        password_hash: 'x',
        full_name: 'SW Test',
        status: 'active',
        role: 'admin',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    staffId = staff.id;
  });

  afterAll(async () => {
    if (orgId) {
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  it('crea token de 64 hex y persiste sha256(token) como token_hash', async () => {
    const { token, sessionId } = await createStaffSession(db, { staffMemberId: staffId });
    expect(token).toMatch(/^[0-9a-f]{64}$/); // randomBytes(32).hex (= v1)
    const row = await db
      .selectFrom('staff_auth_sessions')
      .select(['token_hash', 'remember_me'])
      .where('id', '=', sessionId)
      .executeTakeFirstOrThrow();
    expect(row.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.remember_me).toBe(false);
  });

  it('INTEROP · una sesión creada acá valida con validateStaffSession', async () => {
    const { token, sessionId } = await createStaffSession(db, { staffMemberId: staffId });
    const v = await validateStaffSession(db, token);
    expect(v).not.toBeNull();
    expect(v?.id).toBe(sessionId);
    expect(v?.staffMemberId).toBe(staffId);
  });

  it('TTL · sin remember-me = 12h; con remember-me = 30d (paridad v1)', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const a = await createStaffSession(db, { staffMemberId: staffId }, now);
    const b = await createStaffSession(db, { staffMemberId: staffId, rememberMe: true }, now);
    expect(a.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
    expect(b.expiresAt.getTime()).toBe(now.getTime() + SESSION_REMEMBER_TTL_MS);
    expect(SESSION_TTL_MS).toBe(12 * 60 * 60 * 1000);
    expect(SESSION_REMEMBER_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('expirada · creada con `now` en el pasado → no valida', async () => {
    const past = new Date(Date.now() - 13 * 60 * 60 * 1000); // -13h → expira hace 1h
    const { token } = await createStaffSession(db, { staffMemberId: staffId }, past);
    expect(await validateStaffSession(db, token)).toBeNull();
  });

  it('revoke · invalida la sesión y es idempotente', async () => {
    const { token } = await createStaffSession(db, { staffMemberId: staffId });
    expect(await validateStaffSession(db, token)).not.toBeNull();
    expect(await revokeStaffSession(db, token)).toBe(true); // primera vez revoca
    expect(await validateStaffSession(db, token)).toBeNull(); // ya no valida
    expect(await revokeStaffSession(db, token)).toBe(false); // segunda vez no-op
  });

  it('revoke · token inexistente/vacío → false', async () => {
    expect(await revokeStaffSession(db, 'no-such-token')).toBe(false);
    expect(await revokeStaffSession(db, undefined)).toBe(false);
    expect(await revokeStaffSession(db, '')).toBe(false);
  });
});
