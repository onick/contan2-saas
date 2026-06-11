// apps/api-v2/test/auth-login.test.ts · integration (skip sin DATABASE_URL).
// POST /api/v2/auth/login + /auth/logout end-to-end contra Postgres real.
// Siembra 2 orgs (A con datos, B para cross-tenant) + staff con un hash Argon2id
// REAL en formato PHC de v1 (m=19456,t=2,p=1) → prueba la verificación cross-lib
// (@node-rs/argon2 verifica el formato que produce la lib `argon2` de v1).

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

// Hash Argon2id PHC real para la password PASS, generado con los parámetros
// EXACTOS de v1 (argon2id · v=19 · m=19456,t=2,p=1). El formato es byte-idéntico
// al que produce la lib `argon2` (ranisalt) de v1 → valida la interop cross-lib.
const PASS = 'Contan2-Test-Pass!';
const PHC_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$h6mFPOLtfr7+ncltEFsm5g$PCCpJkesINMLMjCpMT8Haixa+/8p/eFiFrQ8Iw+s83U';

run('POST /auth/login + /auth/logout', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `authlogin-a-${stamp}`;
  const slugB = `authlogin-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  const hostB = `${slugB}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const emailActiveA = `active-a-${stamp}@test.local`;
  const emailSuspendedA = `suspended-a-${stamp}@test.local`;
  const emailB = `user-b-${stamp}@test.local`;

  const mkOrg = async (slug: string) => {
    const o = await db
      .insertInto('organizations')
      .values({ slug, name: `Org ${slug}`, status: 'active' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (
    orgId: string,
    email: string,
    status: 'active' | 'suspended',
    role: 'owner' | 'admin' | 'operator' = 'admin',
  ) => {
    await db
      .insertInto('staff_members')
      .values({
        organization_id: orgId,
        email,
        password_hash: PHC_HASH,
        full_name: 'Login Test',
        status,
        role,
      })
      .execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, emailActiveA, 'active', 'admin');
    await mkStaff(orgAId, emailSuspendedA, 'suspended', 'operator');
    await mkStaff(orgBId, emailB, 'active', 'owner');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  // Cada test usa una IP (X-Forwarded-For) distinta para NO compartir el bucket
  // del rate-limit (10/15min por IP). El bloque /24 se deriva del `stamp` para
  // que cada CORRIDA use IPs frescas: con backend Redis el contador persiste la
  // ventana entre procesos, así un /24 nuevo por corrida evita falsos 429.
  const ipBase = `10.${(stamp >> 16) % 256}.${(stamp >> 8) % 256}`;
  const ip = (n: number) => `${ipBase}.${n}`;

  const login = (
    body: Record<string, unknown>,
    host: string,
    ip: string,
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      headers: { host, 'content-type': 'application/json', 'x-forwarded-for': ip },
      payload: body,
    });

  it('login correcto → 200 + cookie segura + body, y la cookie valida en /auth/me', async () => {
    const res = await login({ email: emailActiveA, password: PASS }, hostA, ip(1));
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.ok).toBe(true);
    expect(json.staff.email).toBe(emailActiveA);
    expect(json.staff.role).toBe('admin');
    expect(json.mustChangePassword).toBe(false);

    const cookie = res.cookies.find((c) => c.name === 'contan2_session');
    expect(cookie).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    expect(cookie?.path).toBe('/');
    expect(typeof cookie?.value).toBe('string');
    expect(cookie?.value.length).toBeGreaterThan(0);

    // INTEROP end-to-end: la sesión creada por el login valida en /auth/me.
    const me = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      headers: { host: hostA },
      cookies: { contan2_session: cookie!.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().staff.email).toBe(emailActiveA);
  });

  it('remember-me → cookie con expiración ~30d (vs ~12h sin remember-me)', async () => {
    const r12 = await login({ email: emailActiveA, password: PASS }, hostA, ip(2));
    const r30 = await login(
      { email: emailActiveA, password: PASS, rememberMe: true },
      hostA,
      ip(3),
    );
    const exp12 = r12.cookies.find((c) => c.name === 'contan2_session')?.expires?.getTime() ?? 0;
    const exp30 = r30.cookies.find((c) => c.name === 'contan2_session')?.expires?.getTime() ?? 0;
    const now = Date.now();
    // 12h ≈ 4.3e7 ms; 30d ≈ 2.6e9 ms. Holgura amplia para evitar flakiness.
    expect(exp12 - now).toBeGreaterThan(10 * 60 * 60 * 1000);
    expect(exp12 - now).toBeLessThan(14 * 60 * 60 * 1000);
    expect(exp30 - now).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it('password incorrecta → 401 (sin cookie)', async () => {
    const res = await login({ email: emailActiveA, password: 'wrong-pass' }, hostA, ip(4));
    expect(res.statusCode).toBe(401);
    expect(res.cookies.find((c) => c.name === 'contan2_session')).toBeUndefined();
  });

  it('usuario inexistente → 401 (mismo mensaje, anti-enumeración)', async () => {
    const res = await login(
      { email: `ghost-${stamp}@test.local`, password: PASS },
      hostA,
      ip(5),
    );
    expect(res.statusCode).toBe(401);
  });

  it('cuenta suspendida con password correcta → 403', async () => {
    const res = await login({ email: emailSuspendedA, password: PASS }, hostA, ip(6));
    expect(res.statusCode).toBe(403);
    expect(res.cookies.find((c) => c.name === 'contan2_session')).toBeUndefined();
  });

  it('cross-tenant · staff de B sobre host A → 401; sobre host B → 200', async () => {
    const onA = await login({ email: emailB, password: PASS }, hostA, ip(7));
    expect(onA.statusCode).toBe(401); // el email de B no existe en A
    const onB = await login({ email: emailB, password: PASS }, hostB, ip(8));
    expect(onB.statusCode).toBe(200);
    expect(onB.json().staff.role).toBe('owner');
  });

  it('body inválido → 400', async () => {
    const res = await login({ email: 'not-an-email', password: '' }, hostA, ip(9));
    expect(res.statusCode).toBe(400);
  });

  it('rate-limit · 10 intentos OK por IP, el 11º → 429', async () => {
    const rlIp = ip(200);
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      // Emails INEXISTENTES (cada uno distinto): así medimos el límite por IP
      // sin disparar el lockout por CUENTA (S1), que bloquea al 5º fallo.
      codes.push((await login({ email: `rl-${stamp}-${i}@test.local`, password: 'x' }, hostA, rlIp)).statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('logout · revoca la sesión y limpia la cookie', async () => {
    // Limpia el lockout que los tests de password-incorrecta acumularon sobre
    // esta cuenta (S1: los fallos persisten en staff_members).
    await db.updateTable('staff_members')
      .set({ failed_attempts: 0, locked_until: null, lock_level: 0 })
      .where('organization_id', '=', orgAId).execute();
    const res = await login({ email: emailActiveA, password: PASS }, hostA, ip(10));
    const token = res.cookies.find((c) => c.name === 'contan2_session')!.value;

    const out = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/logout',
      headers: { host: hostA },
      cookies: { contan2_session: token },
    });
    expect(out.statusCode).toBe(200);
    expect(out.json().ok).toBe(true);
    // La cookie se limpia (expires en el pasado / maxAge 0).
    const cleared = out.cookies.find((c) => c.name === 'contan2_session');
    expect(cleared).toBeTruthy();

    // La sesión quedó revocada → /auth/me con el viejo token → 401.
    const me = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      headers: { host: hostA },
      cookies: { contan2_session: token },
    });
    expect(me.statusCode).toBe(401);
  });
});
