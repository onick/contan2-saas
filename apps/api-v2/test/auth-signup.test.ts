// apps/api-v2/test/auth-signup.test.ts · integration (skip sin DATABASE_URL).
// POST /api/v2/auth/signup + trial gating tests.

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { buildApp } from '../src/server.js';
import { hashToken } from '@contan2/auth';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('POST /auth/signup y trial gating', () => {
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
    // Limpieza de organizaciones creadas durante los tests
    await db.deleteFrom('staff_members').where('email', 'like', `%-${stamp}@test.local`).execute();
    await db.deleteFrom('organizations').where('slug', 'like', `signup-${stamp}%`).execute();
    await db.destroy();
  });

  const signup = (body: Record<string, unknown>, ip = '127.0.0.1') =>
    app.inject({
      method: 'POST',
      url: '/api/v2/auth/signup',
      headers: { host: 'contan2.com', 'content-type': 'application/json', 'x-forwarded-for': ip },
      payload: body,
    });

  it('registro exitoso → crea org (plan free, trial 14d), staff owner y sesión', async () => {
    const slug = `${slugPrefix}-ok`;
    const res = await signup({
      organizationName: slug,
      fullName: 'John Doe',
      email: emailA,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.slug).toBe(slug);
    expect(typeof body.token).toBe('string');

    // Validar base de datos
    const dbOrg = await db
      .selectFrom('organizations')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();
    expect(dbOrg).toBeTruthy();
    expect(dbOrg!.plan).toBe('free');
    expect(dbOrg!.status).toBe('active');
    expect(dbOrg!.trial_ends_at).toBeTruthy();
    
    // Verificar código de visitante prefijo automático (primeras 3 letras mayúsculas de signup...)
    // slug es signup-timestamp-ok -> cleanLetters starts with SIGNUP... -> prefijo SIG
    expect(dbOrg!.code_prefix).toBe('SIG');

    const dbStaff = await db
      .selectFrom('staff_members')
      .selectAll()
      .where('organization_id', '=', dbOrg!.id)
      .executeTakeFirst();
    expect(dbStaff).toBeTruthy();
    expect(dbStaff!.email).toBe(emailA.toLowerCase());
    expect(dbStaff!.role).toBe('owner');
    expect(dbStaff!.status).toBe('active');
  });

  it('registro rechazado si las contraseñas no coinciden → 400', async () => {
    const slug = `${slugPrefix}-mismatch`;
    const res = await signup({
      organizationName: slug,
      fullName: 'John Doe',
      email: emailB,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'DifferentPassword123!',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('contraseñas no coinciden');
  });

  it('registro rechazado con slug reservado → 400', async () => {
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

  it('registro rechazado si el slug ya existe → 400', async () => {
    // Intentar registrar el mismo del primer test exitoso
    const slug = `${slugPrefix}-ok`;
    const res = await signup({
      organizationName: slug,
      fullName: 'Jane Doe',
      email: emailB,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Ya existe una organización registrada');
  });

  it('trial gating → cuando expira el trial (plan free), requiereTenantStaff bloquea (402), pero org/branding aún responde (con status trial_ended)', async () => {
    const slug = `${slugPrefix}-gate`;
    const emailGate = `gate-${stamp}@test.local`;
    const res = await signup({
      organizationName: slug,
      fullName: 'Gate Tester',
      email: emailGate,
      password: 'SuperSecurePassword123!',
      confirmPassword: 'SuperSecurePassword123!',
    });
    expect(res.statusCode).toBe(201);
    const { token } = res.json();
    const host = `${slug}.contan2.com`;

    // 1) Acceder con trial activo → funciona todo
    const brandingActive = await app.inject({
      method: 'GET',
      url: '/api/v2/org/branding',
      headers: { host },
      cookies: { contan2_session: token },
    });
    expect(brandingActive.statusCode).toBe(200);
    expect(brandingActive.json().organization.status).toBe('active');

    // 2) Forzar vencimiento del trial en la base de datos (set a ayer)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await db
      .updateTable('organizations')
      .set({ trial_ends_at: yesterday })
      .where('slug', '=', slug)
      .execute();

    // 3) Intentar obtener branding -> debe responder 200 pero con status 'trial_ended'
    const brandingExpired = await app.inject({
      method: 'GET',
      url: '/api/v2/org/branding',
      headers: { host },
      cookies: { contan2_session: token },
    });
    expect(brandingExpired.statusCode).toBe(200);
    expect(brandingExpired.json().organization.status).toBe('trial_ended');

    // 4) Intentar editar branding (que no usa allowTrialEnded) -> debe retornar 402 Payment Required
    const brandingPatch = await app.inject({
      method: 'PATCH',
      url: '/api/v2/org/branding',
      headers: { host, 'content-type': 'application/json' },
      cookies: { contan2_session: token },
      payload: { name: `Nuevo nombre ${slug}` },
    });
    expect(brandingPatch.statusCode).toBe(402);
    expect(brandingPatch.json().error).toContain('Período de prueba terminado');

    // 5) Intentar check-in público o scanner -> debe retornar 402
    const publicCheckin = await app.inject({
      method: 'GET',
      url: '/api/v2/public/activities', // no importa que no exista la actividad, el gate del tenant corre antes
      headers: { host },
    });
    expect(publicCheckin.statusCode).toBe(402);
  });
});
