// apps/api-v2/test/cookie-secure.test.ts · integration (skip sin DATABASE_URL).
// Prueba que login, logout y scanner usan la MISMA decisión de Secure (helper
// compartido), conservando HttpOnly + SameSite=Lax + Path=/, y que el override
// COOKIE_SECURE manda. `baseCookieOptions` lee process.env por request → se
// puede togglear COOKIE_SECURE por test sobre la misma app.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const PASS = 'Contan2-Test-Pass!';
const PHC_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$h6mFPOLtfr7+ncltEFsm5g$PCCpJkesINMLMjCpMT8Haixa+/8p/eFiFrQ8Iw+s83U';

run('cookie Secure · login/logout/scanner usan la misma decisión', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `cookiesec-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;
  const email = `cs-${stamp}@test.local`;
  const prevSecure = process.env.COOKIE_SECURE;

  const ipBase = `10.${(stamp >> 16) % 256}.${(stamp >> 8) % 256}`;
  let n = 0;
  const ip = () => `${ipBase}.${(n += 1)}`;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const o = await db
      .insertInto('organizations')
      .values({ slug, name: `Org ${slug}`, status: 'active', staff_pin_hash: bcrypt.hashSync('1234', 10) })
      .returning('id')
      .executeTakeFirstOrThrow();
    orgId = o.id;
    await db
      .insertInto('staff_members')
      .values({ organization_id: orgId, email, password_hash: PHC_HASH, full_name: 'CS', status: 'active', role: 'admin' })
      .execute();
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
    if (prevSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = prevSecure;
  });

  afterEach(() => {
    delete process.env.COOKIE_SECURE;
  });

  const login = () =>
    app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      headers: { host, 'content-type': 'application/json', 'x-forwarded-for': ip() },
      payload: { email, password: PASS },
    });
  const pin = () =>
    app.inject({
      method: 'POST',
      url: '/api/v2/scanner/pin',
      headers: { host, 'content-type': 'application/json', 'x-forwarded-for': ip() },
      payload: { pin: '1234' },
    });
  const cookieOf = (res: Awaited<ReturnType<typeof login>>, name: string) =>
    res.cookies.find((c) => c.name === name);

  it('COOKIE_SECURE=true → login Y scanner setean Secure (misma decisión) + HttpOnly/Lax/Path', async () => {
    process.env.COOKIE_SECURE = 'true';
    const lr = await login();
    const lc = cookieOf(lr, 'contan2_session')!;
    expect(lc.secure).toBe(true);
    expect(lc.httpOnly).toBe(true);
    expect(lc.sameSite?.toLowerCase()).toBe('lax');
    expect(lc.path).toBe('/');

    const pr = await pin();
    expect(pr.statusCode).toBe(200);
    const sc = cookieOf(pr, 'scanner_session')!;
    expect(sc.secure).toBe(true);
    expect(sc.httpOnly).toBe(true);
    expect(sc.sameSite?.toLowerCase()).toBe('lax');
    expect(sc.path).toBe('/');
  });

  it('COOKIE_SECURE=false → override apaga Secure aunque sea staging/prod', async () => {
    process.env.COOKIE_SECURE = 'false';
    const lc = cookieOf(await login(), 'contan2_session')!;
    // Sin atributo Secure, el parser devuelve undefined (falsy), no `false`.
    expect(lc.secure).toBeFalsy();
  });

  it('sin override (NODE_ENV=test) → NO Secure (HTTP local sigue funcionando)', async () => {
    const lc = cookieOf(await login(), 'contan2_session')!;
    expect(lc.secure).toBeFalsy();
  });

  it('logout limpia con atributos compatibles (Secure coincide con la decisión)', async () => {
    process.env.COOKIE_SECURE = 'true';
    const out = await app.inject({ method: 'POST', url: '/api/v2/auth/logout', headers: { host } });
    const cleared = cookieOf(out, 'contan2_session')!;
    expect(cleared).toBeTruthy();
    expect(cleared.path).toBe('/');
    expect(cleared.secure).toBe(true); // borra con el mismo Secure que la original
    // cookie de borrado: expira en el pasado / maxAge 0
    expect(cleared.maxAge === 0 || (cleared.expires?.getTime() ?? Infinity) <= Date.now()).toBe(true);
  });
});
