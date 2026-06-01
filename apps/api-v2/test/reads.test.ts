// apps/api-v2/test/reads.test.ts · integration (skip sin DATABASE_URL).
// Endpoints read-only de negocio: dashboard/activities/users/attendance.
// Self-contained: siembra 2 orgs (A con datos, B para aislamiento), staff +
// sesiones, y ejercita cada endpoint validando el shape con los schemas Zod
// de @contan2/contracts + el aislamiento por tenant.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import {
  DashboardMetricsResponseSchema,
  ActivitiesListResponseSchema,
  UsersListResponseSchema,
  UserDetailResponseSchema,
  AttendanceListResponseSchema,
} from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('endpoints read-only de negocio', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `reads-a-${stamp}`;
  const slugB = `reads-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { a: `reads-tok-a-${stamp}`, b: `reads-tok-b-${stamp}` };

  let act1Id: string;
  const codeU1 = 'CCB-RDA001';

  const mkOrg = async (slug: string) => {
    const o = await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active' })
      .returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (orgId: string, token: string) => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId,
      email: `staff-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: 'Reads Staff', status: 'active', role: 'admin',
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
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.a);
    await mkStaff(orgBId, TOK.b);

    // Datos de orgA: 2 usuarios, 2 actividades (1 activa), 2 asistencias (1 anónima).
    const u1 = randomUUID();
    const u2 = randomUUID();
    await db.insertInto('users').values([
      { id: u1, organization_id: orgAId, code: codeU1, first_name: 'Carmen', last_name: 'Objío', email: 'carmen.real@ccb.do', phone: '809-555-0001' },
      { id: u2, organization_id: orgAId, code: 'CCB-RDA002', first_name: 'Luis', last_name: 'Marte', email: 'luis.real@ccb.do', phone: null },
    ]).execute();
    // Usuario de orgB (para probar aislamiento).
    await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgBId, code: 'MEM-RDB001', first_name: 'Ajeno', last_name: 'Tenant', email: 'ajeno@b.do', phone: null,
    }).execute();

    act1Id = randomUUID();
    const act2 = randomUUID();
    await db.insertInto('activities').values([
      { id: act1Id, organization_id: orgAId, name: 'Concierto Los Congos', type: 'Concierto', location: 'Sala 1', date: new Date().toISOString(), capacity: 100, status: 'activa' },
      { id: act2, organization_id: orgAId, name: 'Cine Foro', type: 'Cine', location: 'Sala 2', date: new Date().toISOString(), capacity: 50, status: 'finalizada' },
    ]).execute();

    await db.insertInto('attendance').values([
      { id: randomUUID(), organization_id: orgAId, user_id: u1, user_code: codeU1, activity_id: act1Id, activity_name: 'Concierto Los Congos', anonymous: false, checked_in_at: new Date().toISOString() },
      { id: randomUUID(), organization_id: orgAId, user_id: null, user_code: null, activity_id: act1Id, activity_name: 'Concierto Los Congos', anonymous: true },
    ]).execute();

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const get = (url: string, host: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: { host }, ...(token ? { cookies: { contan2_session: token } } : {}) });

  it('GET /dashboard/metrics → 200 + shape + counts tenant-scoped', async () => {
    const res = await get('/api/v2/dashboard/metrics', hostA, TOK.a);
    expect(res.statusCode).toBe(200);
    const body = DashboardMetricsResponseSchema.parse(res.json());
    expect(body.metrics.totalUsers).toBe(2); // no cuenta el de orgB
    expect(body.metrics.totalActivities).toBe(2);
    expect(body.metrics.activeActivities).toBe(1);
    expect(body.metrics.totalAttendance).toBe(2);
    expect(body.metrics.checkedIn).toBe(1);
  });

  it('GET /activities → 200 + shape; filtro status=activa', async () => {
    const all = await get('/api/v2/activities', hostA, TOK.a);
    expect(all.statusCode).toBe(200);
    const body = ActivitiesListResponseSchema.parse(all.json());
    expect(body.total).toBe(2);

    const active = ActivitiesListResponseSchema.parse((await get('/api/v2/activities?status=activa', hostA, TOK.a)).json());
    expect(active.total).toBe(1);
    expect(active.items[0]?.status).toBe('activa');
  });

  it('GET /users → 200 + PII real + aislamiento de tenant', async () => {
    const body = UsersListResponseSchema.parse((await get('/api/v2/users', hostA, TOK.a)).json());
    expect(body.total).toBe(2); // NO incluye al usuario de orgB
    const carmen = body.items.find((u) => u.code === codeU1);
    expect(carmen?.email).toBe('carmen.real@ccb.do'); // PII real al staff del mismo tenant
  });

  it('GET /users/:code → 200 válido; 404 desconocido; 404 malformado', async () => {
    const ok = await get(`/api/v2/users/${codeU1.toLowerCase()}`, hostA, TOK.a); // normaliza a upper
    expect(ok.statusCode).toBe(200);
    expect(UserDetailResponseSchema.parse(ok.json()).user.code).toBe(codeU1);

    expect((await get('/api/v2/users/CCB-ZZZ999', hostA, TOK.a)).statusCode).toBe(404);
    expect((await get('/api/v2/users/not-a-code', hostA, TOK.a)).statusCode).toBe(404);
  });

  it('GET /attendance → 200 + shape; anónimo con userCode/nombre null; filtro activityId', async () => {
    const body = AttendanceListResponseSchema.parse((await get('/api/v2/attendance', hostA, TOK.a)).json());
    expect(body.total).toBe(2);
    expect(body.items.some((a) => a.anonymous && a.userCode === null && a.firstName === null)).toBe(true);

    const byAct = AttendanceListResponseSchema.parse((await get(`/api/v2/attendance?activityId=${act1Id}`, hostA, TOK.a)).json());
    expect(byAct.total).toBe(2);
  });

  it('cross-tenant (staff de orgB sobre host A) → 403', async () => {
    expect((await get('/api/v2/users', hostA, TOK.b)).statusCode).toBe(403);
  });

  it('sin cookie → 401', async () => {
    expect((await get('/api/v2/users', hostA)).statusCode).toBe(401);
  });
});
