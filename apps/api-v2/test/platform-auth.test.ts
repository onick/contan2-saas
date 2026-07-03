// apps/api-v2/test/platform-auth.test.ts · login/logout/me del platform admin.
// PG efímero (skip sin DATABASE_URL). Cookie propia contan2_admin_session,
// separada de la del tenant.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDb, type Database } from '@contan2/db';
import type { Kysely } from 'kysely';
import { buildApp } from '../src/server.js';
import { hashStaffPassword } from '../src/services/password.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('platform auth · login/logout/me', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const email = `pa-${stamp}@test.local`;
  const password = 'SuperSecret!Platform1';
  let adminId: string;

  const cookieFrom = (h: unknown): string | null => {
    const arr = Array.isArray(h) ? h : h ? [h] : [];
    for (const c of arr) { const m = /contan2_admin_session=([^;]+)/.exec(String(c)); if (m) return m[1]!; }
    return null;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const hash = await hashStaffPassword(password);
    adminId = (await db.insertInto('platform_admins').values({
      email, password_hash: hash, full_name: 'Plat Admin', status: 'active',
    }).returning('id').executeTakeFirstOrThrow()).id;
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('platform_sessions').where('platform_admin_id', '=', adminId).execute();
    await db.deleteFrom('platform_admins').where('id', '=', adminId).execute();
    await db.destroy();
  });

  const login = (body: Record<string, unknown>) => app.inject({
    method: 'POST', url: '/api/v2/platform/auth/login',
    headers: { host: 'admin.contan2.com', 'content-type': 'application/json' }, payload: body,
  });

  it('body inválido → 400', async () => {
    expect((await login({ email: 'no-mail', password: '' })).statusCode).toBe(400);
  });

  it('password incorrecta → 401 (anti-enumeración)', async () => {
    expect((await login({ email, password: 'wrong' })).statusCode).toBe(401);
    // email inexistente → mismo 401
    expect((await login({ email: `nope-${stamp}@x.com`, password })).statusCode).toBe(401);
  });

  it('login ok → 200 + cookie; me con cookie → 200; sin cookie → 401', async () => {
    const res = await login({ email, password, rememberMe: true });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.ok).toBe(true);
    expect(j.admin.email).toBe(email);
    const token = cookieFrom(res.headers['set-cookie']);
    expect(token).toBeTruthy();

    const me = await app.inject({ method: 'GET', url: '/api/v2/platform/auth/me', headers: { host: 'admin.contan2.com', cookie: `contan2_admin_session=${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().admin.email).toBe(email);

    // sin cookie → 401
    expect((await app.inject({ method: 'GET', url: '/api/v2/platform/auth/me', headers: { host: 'admin.contan2.com' } })).statusCode).toBe(401);

    // logout revoca: la misma cookie deja de servir
    const out = await app.inject({ method: 'POST', url: '/api/v2/platform/auth/logout', headers: { host: 'admin.contan2.com', cookie: `contan2_admin_session=${token}` } });
    expect(out.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/v2/platform/auth/me', headers: { host: 'admin.contan2.com', cookie: `contan2_admin_session=${token}` } });
    expect(after.statusCode).toBe(401);
  });

  it('cookie de tenant NO sirve para el panel (aislamiento)', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/v2/platform/auth/me', headers: { host: 'admin.contan2.com', cookie: 'contan2_session=whatever' } });
    expect(me.statusCode).toBe(401);
  });

  it('mi cuenta: cambiar contraseña + sesiones', async () => {
    // login fresco
    const login = await app.inject({ method: 'POST', url: '/api/v2/platform/auth/login', headers: { host: 'admin.contan2.com', 'content-type': 'application/json' }, payload: { email, password } });
    const tok = cookieFrom(login.headers['set-cookie'])!;
    const H = { host: 'admin.contan2.com', cookie: `contan2_admin_session=${tok}`, 'content-type': 'application/json' };

    // actual incorrecta → 401
    expect((await app.inject({ method: 'POST', url: '/api/v2/platform/auth/change-password', headers: H, payload: { currentPassword: 'nope', newPassword: 'BrandNewPass!9' } })).statusCode).toBe(401);
    // nueva muy corta → 400
    expect((await app.inject({ method: 'POST', url: '/api/v2/platform/auth/change-password', headers: H, payload: { currentPassword: password, newPassword: 'short' } })).statusCode).toBe(400);
    // ok
    const newPw = 'BrandNewPass!9';
    expect((await app.inject({ method: 'POST', url: '/api/v2/platform/auth/change-password', headers: H, payload: { currentPassword: password, newPassword: newPw } })).statusCode).toBe(200);
    // la vieja ya no loguea; la nueva sí
    expect((await app.inject({ method: 'POST', url: '/api/v2/platform/auth/login', headers: { host: 'admin.contan2.com', 'content-type': 'application/json' }, payload: { email, password } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v2/platform/auth/login', headers: { host: 'admin.contan2.com', 'content-type': 'application/json' }, payload: { email, password: newPw } })).statusCode).toBe(200);

    // sesiones: la actual aparece marcada; sin cookie → 401
    expect((await app.inject({ method: 'GET', url: '/api/v2/platform/auth/sessions', headers: { host: 'admin.contan2.com' } })).statusCode).toBe(401);
    const sess = await app.inject({ method: 'GET', url: '/api/v2/platform/auth/sessions', headers: { host: 'admin.contan2.com', cookie: `contan2_admin_session=${tok}` } });
    expect(sess.statusCode).toBe(200);
    const list = sess.json().sessions;
    const current = list.find((s: { current: boolean }) => s.current);
    expect(current).toBeTruthy();
    // revocar una sesión ajena inexistente → 404; revocar la propia → 200
    expect((await app.inject({ method: 'DELETE', url: '/api/v2/platform/auth/sessions/00000000-0000-0000-0000-000000000000', headers: { host: 'admin.contan2.com', cookie: `contan2_admin_session=${tok}` } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/v2/platform/auth/sessions/${current.id}`, headers: { host: 'admin.contan2.com', cookie: `contan2_admin_session=${tok}` } })).statusCode).toBe(200);
  });
});
