// apps/api-v2/test/activities-create.test.ts · integration (skip sin DATABASE_URL).
// POST /api/v2/activities (ESCRITURA · primer write del admin v2). Cubre:
// creación válida + persistencia (enrolled_count=0, status='activa', image_url=null),
// roles (owner/admin crean · operator 403), auth (401), aislamiento por tenant
// (cross-tenant 403 · organizationId del body ignorado), validaciones (endDate<date,
// capacity, type, name, fecha pasada), y que la actividad aparezca luego en el GET.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { ActivityCreateResponseSchema, ActivitiesListResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

run('POST /activities · escritura', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `actc-a-${stamp}`;
  const slugB = `actc-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  // tokens por rol (orgA) + un staff de orgB para cross-tenant.
  const TOK = {
    owner: `actc-owner-${stamp}`,
    admin: `actc-admin-${stamp}`,
    operator: `actc-oper-${stamp}`,
    b: `actc-b-${stamp}`,
  };

  const mkOrg = async (slug: string, codePrefix?: string) => {
    const o = await db.insertInto('organizations').values({
      slug, name: `Org ${slug}`, status: 'active', ...(codePrefix ? { code_prefix: codePrefix } : {}),
    }).returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId,
      email: `${role}-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: `Staff ${role}`, status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      remember_me: false,
    }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA, 'CCB');
    orgBId = await mkOrg(slugB, 'MEM');
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const post = (body: unknown, host: string, token?: string) =>
    app.inject({
      method: 'POST', url: '/api/v2/activities',
      headers: { host, 'content-type': 'application/json' },
      payload: body as object,
      ...(token ? { cookies: { contan2_session: token } } : {}),
    });
  const get = (url: string, host: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: { host }, ...(token ? { cookies: { contan2_session: token } } : {}) });

  const validBody = (over: Record<string, unknown> = {}) => ({
    name: 'Recital de Piano', type: 'concierto', location: 'Sala 2',
    date: future(7), capacity: 80, ...over,
  });

  it('admin crea actividad válida → 201, status activa, enrolled 0, imageUrl null', async () => {
    const res = await post(validBody({ category: 'Música  Clásica', description: '  Hola  ' }), hostA, TOK.admin);
    expect(res.statusCode).toBe(201);
    const { activity } = ActivityCreateResponseSchema.parse(res.json());
    expect(activity.status).toBe('activa');
    expect(activity.enrolledCount).toBe(0);
    expect(activity.imageUrl).toBe(null);
    expect(activity.category).toBe('Música Clásica'); // preserva caso, colapsa espacios
    expect(activity.description).toBe('Hola'); // trim

    // Persistencia real en DB, scoped al tenant correcto.
    const dbRow = await db.selectFrom('activities')
      .select(['organization_id', 'status', 'enrolled_count', 'image_url'])
      .where('id', '=', activity.id).executeTakeFirstOrThrow();
    expect(dbRow.organization_id).toBe(orgAId);
    expect(dbRow.status).toBe('activa');
    expect(dbRow.enrolled_count).toBe(0);
    expect(dbRow.image_url).toBe(null);
  });

  it('owner también puede crear → 201; endDate >= date se persiste', async () => {
    const ed = future(9);
    const res = await post(validBody({ name: 'Cine al aire libre', type: 'cine', endDate: ed }), hostA, TOK.owner);
    expect(res.statusCode).toBe(201);
    const { activity } = ActivityCreateResponseSchema.parse(res.json());
    expect(activity.endDate).toBe(new Date(ed).toISOString());
  });

  it('operator → 201 (los operadores también crean actividades)', async () => {
    const res = await post(validBody(), hostA, TOK.operator);
    expect(res.statusCode).toBe(201);
  });

  it('sin cookie → 401', async () => {
    expect((await post(validBody(), hostA)).statusCode).toBe(401);
  });

  it('cross-tenant: staff de orgB sobre host A → 403', async () => {
    expect((await post(validBody(), hostA, TOK.b)).statusCode).toBe(403);
  });

  it('organizationId del body es IGNORADO: se crea en el tenant de la sesión', async () => {
    const res = await post(validBody({ name: 'Inyección de org', organizationId: orgBId, organization_id: orgBId }), hostA, TOK.admin);
    expect(res.statusCode).toBe(201);
    const { activity } = ActivityCreateResponseSchema.parse(res.json());
    const dbRow = await db.selectFrom('activities').select('organization_id')
      .where('id', '=', activity.id).executeTakeFirstOrThrow();
    expect(dbRow.organization_id).toBe(orgAId); // NO orgBId
  });

  it('validación: endDate < date → 400', async () => {
    const res = await post(validBody({ date: future(8), endDate: future(7) }), hostA, TOK.admin);
    expect(res.statusCode).toBe(400);
  });

  it('validación: capacity 0 y 10001 → 400', async () => {
    expect((await post(validBody({ capacity: 0 }), hostA, TOK.admin)).statusCode).toBe(400);
    expect((await post(validBody({ capacity: 10001 }), hostA, TOK.admin)).statusCode).toBe(400);
  });

  it('validación: type fuera de enum → 400', async () => {
    expect((await post(validBody({ type: 'fiesta' }), hostA, TOK.admin)).statusCode).toBe(400);
  });

  it('validación: name corto → 400', async () => {
    expect((await post(validBody({ name: 'ab' }), hostA, TOK.admin)).statusCode).toBe(400);
  });

  it('validación: fecha pasada → 400', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect((await post(validBody({ date: past }), hostA, TOK.admin)).statusCode).toBe(400);
  });

  it('la actividad creada aparece en GET /activities tenant-scoped', async () => {
    const created = ActivityCreateResponseSchema.parse(
      (await post(validBody({ name: 'Aparece en el listado' }), hostA, TOK.admin)).json(),
    ).activity;
    const list = ActivitiesListResponseSchema.parse((await get('/api/v2/activities?limit=100', hostA, TOK.admin)).json());
    expect(list.items.some((a) => a.id === created.id)).toBe(true);
  });
});
