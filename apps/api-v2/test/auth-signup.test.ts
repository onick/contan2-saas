// apps/api-v2/test/auth-signup.test.ts · integration (skip sin DATABASE_URL).
// POST /api/v2/auth/signup (paso 1) + POST /api/v2/auth/signup/verify (paso 2).

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('Signup de 2 pasos: formulario → verificación email → cuenta', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();

  const slugPrefix = `signup-${stamp}`;
  const reservedSlug = 'admin'; // de RESERVED_SUBDOMAINS
  const emailA = `owner-${stamp}@test.local`;
  const emailB = `other-${stamp}@test.local`;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    // Limpieza
    await db.deleteFrom('staff_members').where('email', 'like', `%-${stamp}@test.local`).execute();
    await db.deleteFrom('organizations').where('slug', 'like', `signup-${stamp}%`).execute();
    await db.deleteFrom('signup_verifications').where('email', 'like', `%-${stamp}@test.local`).execute();
    await db.destroy();
  });

  let ipCounter = 1;
  const signup = (body: Record<string, unknown>, ip = `10.0.0.${ipCounter++}`) =>
    app.inject({
      method: 'POST',
      url: '/api/v2/auth/signup',
      headers: { host: 'contan2.com', 'content-type': 'application/json', 'x-forwarded-for': ip },
      payload: body,
    });

  const verify = (body: Record<string, unknown>, ip = `10.0.0.${ipCounter++}`) =>
    app.inject({
      method: 'POST',
      url: '/api/v2/auth/signup/verify',
      headers: { host: 'contan2.com', 'content-type': 'application/json', 'x-forwarded-for': ip },
      payload: body,
    });

  it('paso 1: signup envía código y devuelve email enmascarado', async () => {
    const slug = `${slugPrefix}-ok`;
    const res = await signup({
      organizationName: slug,
      fullName: 'John Doe',
      email: emailA,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.email).toBeTruthy();
    // No debe devolver token ni slug
    expect(body.token).toBeUndefined();
    expect(body.slug).toBeUndefined();

    // Verificar que se creó el registro en signup_verifications
    const verif = await db
      .selectFrom('signup_verifications')
      .selectAll()
      .where('email', '=', emailA.toLowerCase())
      .where('verified_at', 'is', null)
      .executeTakeFirst();
    expect(verif).toBeTruthy();
    expect(verif!.code).toHaveLength(6);
    expect(verif!.slug).toBe(slug);
  });

  it('paso 1: contraseñas no coinciden → 400', async () => {
    const res = await signup({
      organizationName: `${slugPrefix}-mismatch`,
      fullName: 'John Doe',
      email: emailB,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'DifferentPassword123!',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('contraseñas no coinciden');
  });

  it('paso 1: slug reservado → 400', async () => {
    const res = await signup({
      organizationName: reservedSlug,
      fullName: 'John Doe',
      email: emailB,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('está reservado');
  });

  it('paso 1: slug duplicado → 400 (org ya existe en signup previo verificado)', async () => {
    // Primero completar el flujo para el slug del primer test
    const verif = await db
      .selectFrom('signup_verifications')
      .selectAll()
      .where('email', '=', emailA.toLowerCase())
      .where('verified_at', 'is', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    expect(verif).toBeTruthy();

    // Verificar el código
    const verifyRes = await verify({ email: emailA, code: verif!.code });
    expect(verifyRes.statusCode).toBe(201);

    // Intentar registrar otro con el mismo slug
    const slug = `${slugPrefix}-ok`;
    const dupRes = await signup({
      organizationName: slug,
      fullName: 'Jane Doe',
      email: emailB,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });
    expect(dupRes.statusCode).toBe(400);
    expect(dupRes.json().error).toContain('Ya existe una organización registrada');
  });

  it('paso 2: código incorrecto → 400 con intentos restantes', async () => {
    const email = `verifytest-${stamp}@test.local`;
    const slug = `${slugPrefix}-verifytest`;

    await signup({
      organizationName: slug,
      fullName: 'Verify Tester',
      email,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });

    const res = await verify({ email, code: '000000' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Código incorrecto');

    // Limpiar
    await db.deleteFrom('signup_verifications').where('email', '=', email.toLowerCase()).execute();
  });

  it('paso 2: código correcto → crea org (plan free, trial 14d), staff owner y sesión', async () => {
    const email = `fullflow-${stamp}@test.local`;
    const slug = `${slugPrefix}-full`;

    // Paso 1
    const signupRes = await signup({
      organizationName: slug,
      fullName: 'Full Flow',
      email,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });
    expect(signupRes.statusCode).toBe(200);

    // Obtener código de la DB
    const verif = await db
      .selectFrom('signup_verifications')
      .selectAll()
      .where('email', '=', email.toLowerCase())
      .where('verified_at', 'is', null)
      .executeTakeFirst();
    expect(verif).toBeTruthy();

    // Paso 2
    const verifyRes = await verify({ email, code: verif!.code });
    expect(verifyRes.statusCode).toBe(201);
    const body = verifyRes.json();
    expect(body.ok).toBe(true);
    expect(body.slug).toBe(slug);
    expect(typeof body.token).toBe('string');

    // Validar BD
    const dbOrg = await db
      .selectFrom('organizations')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();
    expect(dbOrg).toBeTruthy();
    expect(dbOrg!.plan).toBe('free');
    expect(dbOrg!.status).toBe('active');
    expect(dbOrg!.trial_ends_at).toBeTruthy();

    const dbStaff = await db
      .selectFrom('staff_members')
      .selectAll()
      .where('organization_id', '=', dbOrg!.id)
      .executeTakeFirst();
    expect(dbStaff).toBeTruthy();
    expect(dbStaff!.email).toBe(email.toLowerCase());
    expect(dbStaff!.role).toBe('owner');
    expect(dbStaff!.status).toBe('active');

    // Limpiar
    await db.deleteFrom('staff_members').where('email', '=', email.toLowerCase()).execute();
    await db.deleteFrom('organizations').where('slug', '=', slug).execute();
    await db.deleteFrom('signup_verifications').where('email', '=', email.toLowerCase()).execute();
  });

  it('trial gating: trial expirado → 402 en endpoints, branding sigue respondiendo con trial_ended', async () => {
    const slug = `${slugPrefix}-gate`;
    const emailGate = `gate-${stamp}@test.local`;

    // Paso 1
    await signup({
      organizationName: slug,
      fullName: 'Gate Tester',
      email: emailGate,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });

    // Obtener código y verificar
    const verif = await db
      .selectFrom('signup_verifications')
      .selectAll()
      .where('email', '=', emailGate.toLowerCase())
      .where('verified_at', 'is', null)
      .executeTakeFirst();
    expect(verif).toBeTruthy();

    const verifyRes = await verify({ email: emailGate, code: verif!.code });
    expect(verifyRes.statusCode).toBe(201);
    const { token } = verifyRes.json();
    const host = `${slug}.contan2.com`;

    // Con trial activo → todo funciona
    const brandingActive = await app.inject({
      method: 'GET',
      url: '/api/v2/org/branding',
      headers: { host },
      cookies: { contan2_session: token },
    });
    expect(brandingActive.statusCode).toBe(200);
    expect(brandingActive.json().organization.status).toBe('active');

    // Forzar vencimiento del trial
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await db
      .updateTable('organizations')
      .set({ trial_ends_at: yesterday })
      .where('slug', '=', slug)
      .execute();

    // Branding sigue respondiendo pero con status trial_ended
    const brandingExpired = await app.inject({
      method: 'GET',
      url: '/api/v2/org/branding',
      headers: { host },
      cookies: { contan2_session: token },
    });
    expect(brandingExpired.statusCode).toBe(200);
    expect(brandingExpired.json().organization.status).toBe('trial_ended');

    // Editar branding → 402
    const brandingPatch = await app.inject({
      method: 'PATCH',
      url: '/api/v2/org/branding',
      headers: { host, 'content-type': 'application/json' },
      cookies: { contan2_session: token },
      payload: { name: `Nuevo nombre ${slug}` },
    });
    expect(brandingPatch.statusCode).toBe(402);

    // Endpoint público → 402
    const publicReq = await app.inject({
      method: 'GET',
      url: '/api/v2/public/activities',
      headers: { host },
    });
    expect(publicReq.statusCode).toBe(402);
  });
});
