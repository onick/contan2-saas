// apps/api-v2/test/auth-password.test.ts · integration (skip sin DATABASE_URL).
// S1 auth: forgot (no-leak + token en DB) · reset (cambia hash, one-shot, revoca
// TODAS las sesiones, password débil 400) · change (verifica actual, revoca las
// DEMÁS) · sessions (lista propia + revocar otra; actual → 400) · LOCKOUT
// (5 fallos → 423 escalado; éxito resetea). El hash escrito por v2 debe
// verificar con el mismo verificador (cross-compat argon2id params v1).

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1'; // XFF por test → buckets de rate-limit aislados

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { hashStaffPassword, verifyStaffPassword } from '../src/services/password.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('S1 auth · forgot/reset/change/sessions/lockout', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `auth-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  const PASSWORD = 'ClaveSegura!2026';

  const mkStaff = async (email: string) => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgAId, email, password_hash: await hashStaffPassword(PASSWORD),
      full_name: 'Staff Test', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    return s.id;
  };
  const mkSession = async (staffId: string, token: string) => {
    const r = await db.insertInto('staff_auth_sessions').values({
      staff_member_id: staffId, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).returning('id').executeTakeFirstOrThrow();
    return r.id;
  };

  let ipSeq = 0;
  const post = (url: string, body: unknown, token?: string, ip?: string) =>
    app.inject({
      method: 'POST', url,
      headers: {
        host: hostA, 'content-type': 'application/json',
        'x-forwarded-for': ip ?? `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`,
        ...(token ? { cookie: `contan2_session=${token}` } : {}),
      },
      payload: body as object,
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    const o = await db.insertInto('organizations').values({ slug: slugA, name: 'Org A', status: 'active' })
      .returning('id').executeTakeFirstOrThrow();
    orgAId = o.id;
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('staff_password_resets').where('staff_member_id', 'in',
      db.selectFrom('staff_members').select('id').where('organization_id', '=', orgAId)).execute();
    await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
      db.selectFrom('staff_members').select('id').where('organization_id', '=', orgAId)).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgAId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgAId).execute();
    await db.destroy();
  });

  it('forgot: misma respuesta exista o no la cuenta; con match crea token en DB', async () => {
    const staffId = await mkStaff(`f1-${stamp}@test.local`);
    const r1 = await post('/api/v2/auth/forgot-password', { email: `f1-${stamp}@test.local` });
    const r2 = await post('/api/v2/auth/forgot-password', { email: `nadie-${stamp}@test.local` });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r1.json()).toEqual(r2.json()); // anti-enumeración
    const rows = await db.selectFrom('staff_password_resets').select('id')
      .where('staff_member_id', '=', staffId).execute();
    expect(rows.length).toBe(1);
  });

  it('reset: token válido cambia el hash (cross-verifica), es one-shot y revoca TODAS las sesiones', async () => {
    const staffId = await mkStaff(`f2-${stamp}@test.local`);
    const tok1 = `s1-${stamp}-a`;
    const tok2 = `s1-${stamp}-b`;
    await mkSession(staffId, tok1);
    await mkSession(staffId, tok2);

    const plain = `${'r'.repeat(24)}${stamp}`;
    await db.insertInto('staff_password_resets').values({
      staff_member_id: staffId, token_hash: hashToken(plain),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      requested_ip_hash: null, requested_user_agent: null,
    }).execute();

    const NEW = 'NuevaClave!2026x';
    const res = await post('/api/v2/auth/reset-password', { token: plain, newPassword: NEW });
    expect(res.statusCode).toBe(200);

    const member = await db.selectFrom('staff_members').select('password_hash').where('id', '=', staffId).executeTakeFirstOrThrow();
    expect(await verifyStaffPassword(member.password_hash, NEW)).toBe(true);
    expect(await verifyStaffPassword(member.password_hash, PASSWORD)).toBe(false);

    // todas las sesiones revocadas
    const live = await db.selectFrom('staff_auth_sessions').select('id')
      .where('staff_member_id', '=', staffId).where('revoked_at', 'is', null).execute();
    expect(live.length).toBe(0);

    // one-shot: reuso → 400
    expect((await post('/api/v2/auth/reset-password', { token: plain, newPassword: 'OtraClave!2026x' })).statusCode).toBe(400);
  });

  it('reset: password débil → 400 con motivos; token expirado → 400', async () => {
    const staffId = await mkStaff(`f3-${stamp}@test.local`);
    const plain = `${'e'.repeat(24)}${stamp}`;
    await db.insertInto('staff_password_resets').values({
      staff_member_id: staffId, token_hash: hashToken(plain),
      expires_at: new Date(Date.now() - 1000).toISOString(), // ya expirado
      requested_ip_hash: null, requested_user_agent: null,
    }).execute();
    const weak = await post('/api/v2/auth/reset-password', { token: plain, newPassword: 'corta' });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error).toMatch(/débil/i);
    expect((await post('/api/v2/auth/reset-password', { token: plain, newPassword: 'ClaveLargaValida1' })).statusCode).toBe(400);
  });

  it('change: actual incorrecta → 401; correcta → 200, revoca las DEMÁS sesiones', async () => {
    const staffId = await mkStaff(`f4-${stamp}@test.local`);
    const tokCur = `s1c-${stamp}`;
    const tokOther = `s1o-${stamp}`;
    const curId = await mkSession(staffId, tokCur);
    await mkSession(staffId, tokOther);

    expect((await post('/api/v2/auth/change-password', { currentPassword: 'mala', newPassword: 'ClaveLargaValida1' }, tokCur)).statusCode).toBe(401);

    const ok = await post('/api/v2/auth/change-password', { currentPassword: PASSWORD, newPassword: 'ClaveLargaValida1' }, tokCur);
    expect(ok.statusCode).toBe(200);

    const live = await db.selectFrom('staff_auth_sessions').select('id')
      .where('staff_member_id', '=', staffId).where('revoked_at', 'is', null).execute();
    expect(live.map((r) => r.id)).toEqual([curId]); // sólo la actual sigue viva
  });

  it('sessions: lista propias (current marcada) y revoca otra; la actual → 400', async () => {
    const staffId = await mkStaff(`f5-${stamp}@test.local`);
    const tokCur = `s5c-${stamp}`;
    const curId = await mkSession(staffId, tokCur);
    const otherId = await mkSession(staffId, `s5o-${stamp}`);

    const list = await app.inject({ method: 'GET', url: '/api/v2/auth/sessions', headers: { host: hostA, cookie: `contan2_session=${tokCur}` } });
    expect(list.statusCode).toBe(200);
    const sessions = list.json().sessions as Array<{ id: string; current: boolean }>;
    expect(sessions.length).toBe(2);
    expect(sessions.find((s) => s.id === curId)?.current).toBe(true);

    const delCur = await app.inject({ method: 'DELETE', url: `/api/v2/auth/sessions/${curId}`, headers: { host: hostA, cookie: `contan2_session=${tokCur}` } });
    expect(delCur.statusCode).toBe(400);

    const delOther = await app.inject({ method: 'DELETE', url: `/api/v2/auth/sessions/${otherId}`, headers: { host: hostA, cookie: `contan2_session=${tokCur}` } });
    expect(delOther.statusCode).toBe(204);

    // sesión de OTRO staff → 404
    const foreign = await mkStaff(`f5b-${stamp}@test.local`);
    const foreignSession = await mkSession(foreign, `s5f-${stamp}`);
    const delForeign = await app.inject({ method: 'DELETE', url: `/api/v2/auth/sessions/${foreignSession}`, headers: { host: hostA, cookie: `contan2_session=${tokCur}` } });
    expect(delForeign.statusCode).toBe(404);
  });

  it('lockout: 5 fallos → 423 con bloqueo; login correcto tras el lock sigue 423; reset de contadores al expirar', async () => {
    const email = `f6-${stamp}@test.local`;
    const staffId = await mkStaff(email);

    for (let i = 0; i < 4; i++) {
      const r = await post('/api/v2/auth/login', { email, password: 'incorrecta1', rememberMe: false });
      expect(r.statusCode).toBe(401);
    }
    const fifth = await post('/api/v2/auth/login', { email, password: 'incorrecta1', rememberMe: false });
    expect(fifth.statusCode).toBe(423);
    expect(fifth.json().error).toMatch(/bloqueada/i);

    // Aun con el password CORRECTO, bloqueada → 423 (no se intenta verificar).
    expect((await post('/api/v2/auth/login', { email, password: PASSWORD, rememberMe: false })).statusCode).toBe(423);

    // Simular expiración del lock → login correcto entra y resetea contadores.
    await db.updateTable('staff_members').set({ locked_until: new Date(Date.now() - 1000).toISOString() })
      .where('id', '=', staffId).execute();
    const ok = await post('/api/v2/auth/login', { email, password: PASSWORD, rememberMe: false });
    expect(ok.statusCode).toBe(200);
    const row = await db.selectFrom('staff_members').select(['failed_attempts', 'lock_level', 'locked_until'])
      .where('id', '=', staffId).executeTakeFirstOrThrow();
    expect(row.failed_attempts).toBe(0);
    expect(row.lock_level).toBe(0);
    expect(row.locked_until).toBeNull();
  });
});
