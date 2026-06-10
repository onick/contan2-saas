// apps/api-v2/test/activities-summary.test.ts · integration (skip sin DATABASE_URL).
// GET /api/v2/activities/:id/summary — paridad v1 (insights/activity-summary):
//   mezcla de nuevos/habituales/VIP/anónimos/companions → números exactos;
//   sin asistencias → todo en cero; operator también puede leer; 401 sin cookie;
//   404 inexistente; las asistencias de OTRO tenant no contaminan los conteos.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { ActivitySummaryResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

run('GET /activities/:id/summary · resumen post-evento', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `actsum-a-${stamp}`;
  const slugB = `actsum-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { admin: `actsum-admin-${stamp}`, operator: `actsum-oper-${stamp}` };

  const mkOrg = async (slug: string) => {
    const o = await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active' })
      .returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (orgId: string, token: string, role: 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: `Staff ${role}`, status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };
  const mkActivity = async (org: string, capacity = 100, enrolled = 0) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: org, name: `Act ${id.slice(0, 6)}`, type: 'concierto',
      location: 'Sala', date: future(3), capacity, enrolled_count: enrolled,
      status: 'activa', description: '', image_url: null, category: null,
    }).execute();
    return id;
  };
  const mkUser = async (org: string) => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: org, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'V', last_name: 'I', email: null, phone: null, visit_count: 0,
    } as never).execute();
    return id;
  };
  const attend = async (org: string, activityId: string, userId: string | null, companions = 0) => {
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: org, user_id: userId, activity_id: activityId,
      activity_name: 'x', user_code: null, anonymous: userId === null, companions_children: companions,
    } as never).execute();
  };

  const getSummary = (id: string, token?: string) =>
    app.inject({
      method: 'GET', url: `/api/v2/activities/${id}/summary`,
      headers: { host: hostA, ...(token ? { cookie: `contan2_session=${token}` } : {}) },
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
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

  it('mezcla real: nuevos/habitual/VIP/anónimo/companions → números exactos', async () => {
    const act = await mkActivity(orgAId, 100, 80); // 80% ocupación
    const prev1 = await mkActivity(orgAId); // historial previo
    const prev2 = await mkActivity(orgAId);

    // u1, u2: NUEVOS (su única asistencia es esta actividad).
    const u1 = await mkUser(orgAId);
    const u2 = await mkUser(orgAId);
    await attend(orgAId, act, u1);
    await attend(orgAId, act, u2, 2); // u2 trae 2 niños

    // u3: HABITUAL (2 previas + esta = 3 totales).
    const u3 = await mkUser(orgAId);
    await attend(orgAId, prev1, u3);
    await attend(orgAId, prev2, u3);
    await attend(orgAId, act, u3);

    // u4: VIP (9 previas + esta = 10 totales).
    const u4 = await mkUser(orgAId);
    for (let i = 0; i < 9; i++) {
      const p = await mkActivity(orgAId);
      await attend(orgAId, p, u4);
    }
    await attend(orgAId, act, u4);

    // 1 anónimo (walk-in) + 1 niño acompañante.
    await attend(orgAId, act, null, 1);

    // Ruido de OTRO tenant con un activity_id distinto: no contamina.
    const actB = await mkActivity(orgBId);
    const uB = await mkUser(orgBId);
    await attend(orgBId, actB, uB);

    const res = await getSummary(act, TOK.admin);
    expect(res.statusCode).toBe(200);
    const { summary } = ActivitySummaryResponseSchema.parse(res.json());
    expect(summary).toEqual({
      totalAttendances: 5, // u1 u2 u3 u4 + anónimo
      identifiedCount: 4,
      anonymousCount: 1,
      occupancyPct: 80,
      newcomers: 2, // u1 u2
      returning: 2, // u3 u4
      vipCount: 1, // u4
      avgPriorAttendances: 2.8, // (0+0+2+9)/4
      newcomerRatio: 50,
      companionsChildren: 3, // 2 de u2 + 1 del anónimo
      peopleInRoom: 8, // 5 + 3
    });
  });

  it('sin asistencias → todo en cero (la UI oculta la sección)', async () => {
    const act = await mkActivity(orgAId, 50, 0);
    const res = await getSummary(act, TOK.operator); // operator también lee
    expect(res.statusCode).toBe(200);
    const { summary } = ActivitySummaryResponseSchema.parse(res.json());
    expect(summary.totalAttendances).toBe(0);
    expect(summary.newcomers).toBe(0);
    expect(summary.avgPriorAttendances).toBe(0);
    expect(summary.peopleInRoom).toBe(0);
  });

  it('sin cookie → 401; actividad inexistente → 404', async () => {
    const act = await mkActivity(orgAId);
    expect((await getSummary(act)).statusCode).toBe(401);
    expect((await getSummary(randomUUID(), TOK.admin)).statusCode).toBe(404);
  });
});
