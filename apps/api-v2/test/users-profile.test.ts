// apps/api-v2/test/users-profile.test.ts · integration (skip sin DATABASE_URL).
// User Intelligence UI-2a: detalle enriquecido + historial paginado + afinidad
// derivada (on-demand). Aislamiento de tenant. Sólo lectura.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import {
  UserDetailResponseSchema, UserActivityHistoryResponseSchema, UserAffinityResponseSchema,
} from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;
const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

run('users · perfil (detalle + historial + afinidad) UI-2a', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `prf-a-${stamp}`;
  const slugB = `prf-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string; let orgBId: string;
  const TOK = { a: `prf-tok-a-${stamp}`, b: `prf-tok-b-${stamp}` };
  const CODE_MAIN = 'CCB-PRF001';
  const CODE_EMPTY = 'CCB-PRF002';
  const CODE_B = 'MEM-PRFB01';

  const mkOrg = async (slug: string) => (await db.insertInto('organizations')
    .values({ slug, name: `Org ${slug}`, status: 'active' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string) => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `staff-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: 'Prf Staff', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgAId = await mkOrg(slugA); orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.a); await mkStaff(orgBId, TOK.b);

    const uMain = randomUUID(); const uEmpty = randomUUID();
    await db.insertInto('users').values([
      { id: uMain, organization_id: orgAId, code: CODE_MAIN, first_name: 'Sofía', last_name: 'Méndez', email: 'sofia@ccb.do', phone: '809-555-1', visit_count: 2, credential_sent_at: daysAgoIso(3) },
      { id: uEmpty, organization_id: orgAId, code: CODE_EMPTY, first_name: 'Nunca', last_name: 'Visito', email: null, phone: null, visit_count: 0 },
    ]).execute();
    await db.insertInto('users').values({ id: randomUUID(), organization_id: orgBId, code: CODE_B, first_name: 'Ajeno', last_name: 'B', email: null, phone: null }).execute();

    const a1 = randomUUID(); const a2 = randomUUID(); const a3 = randomUUID();
    await db.insertInto('activities').values([
      { id: a1, organization_id: orgAId, name: 'Concierto', type: 'Concierto', location: 'Sala 1', category: 'Música', date: daysAgoIso(1), capacity: 100, status: 'activa' },
      { id: a2, organization_id: orgAId, name: 'Cine Foro', type: 'Cine', location: 'Sala 2', category: null, date: daysAgoIso(10), capacity: 50, status: 'finalizada' },
      { id: a3, organization_id: orgAId, name: 'Taller Arte', type: 'Taller', location: 'Sala 1', category: 'Arte', date: daysAgoIso(2), capacity: 30, status: 'activa' },
    ]).execute();
    // uMain: asistió a a1 (ayer, companions 2) y a2 (hace 10d); a3 sólo RSVP (sin checked_in).
    await db.insertInto('attendance').values([
      { id: randomUUID(), organization_id: orgAId, user_id: uMain, user_code: CODE_MAIN, activity_id: a1, activity_name: 'Concierto', anonymous: false, checked_in_at: daysAgoIso(1), companions_children: 2, registered_at: daysAgoIso(1) },
      { id: randomUUID(), organization_id: orgAId, user_id: uMain, user_code: CODE_MAIN, activity_id: a2, activity_name: 'Cine Foro', anonymous: false, checked_in_at: daysAgoIso(10), companions_children: 0, registered_at: daysAgoIso(10) },
      { id: randomUUID(), organization_id: orgAId, user_id: uMain, user_code: CODE_MAIN, activity_id: a3, activity_name: 'Taller Arte', anonymous: false, checked_in_at: null, companions_children: 0, registered_at: daysAgoIso(5) },
    ]).execute();

    app = buildApp(); await app.ready();
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

  const get = (url: string, host = hostA, token: string | null = TOK.a) =>
    app.inject({ method: 'GET', url, headers: { host }, ...(token ? { cookies: { contan2_session: token } } : {}) });

  it('detalle ENRIQUECIDO: lastVisitAt + credentialSentAt + status', async () => {
    const res = await get(`/api/v2/users/${CODE_MAIN}`);
    expect(res.statusCode).toBe(200);
    const { user } = UserDetailResponseSchema.parse(res.json());
    expect(user.code).toBe(CODE_MAIN);
    expect(user.email).toBe('sofia@ccb.do');
    expect(user.lastVisitAt).not.toBeNull();
    expect(user.credentialSentAt).not.toBeNull();
    expect(user.status).toBe('active'); // última visita ayer
  });

  it('detalle 404: código inexistente y cross-tenant (code de orgB en host de orgA)', async () => {
    expect((await get('/api/v2/users/CCB-ZZZ999')).statusCode).toBe(404);
    expect((await get(`/api/v2/users/${CODE_B}`)).statusCode).toBe(404); // no existe en orgA
  });

  it('historial paginado: total exacto, attended/checkedInAt/companionsChildren', async () => {
    const body = UserActivityHistoryResponseSchema.parse((await get(`/api/v2/users/${CODE_MAIN}/activities`)).json());
    expect(body.total).toBe(3); // 2 asistencias + 1 RSVP
    const a1 = body.items.find((i) => i.name === 'Concierto')!;
    expect(a1.attended).toBe(true);
    expect(a1.checkedInAt).not.toBeNull();
    expect(a1.companionsChildren).toBe(2);
    expect(a1.location).toBe('Sala 1');
    const a3 = body.items.find((i) => i.name === 'Taller Arte')!;
    expect(a3.attended).toBe(false); // sólo RSVP
    expect(a3.checkedInAt).toBeNull();
    // paginación
    const p = UserActivityHistoryResponseSchema.parse((await get(`/api/v2/users/${CODE_MAIN}/activities?limit=2&offset=0`)).json());
    expect(p.total).toBe(3);
    expect(p.items.length).toBe(2);
  });

  it('historial vacío: usuario sin asistencias → total 0', async () => {
    const body = UserActivityHistoryResponseSchema.parse((await get(`/api/v2/users/${CODE_EMPTY}/activities`)).json());
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  it('afinidad derivada: tipos/categorías/ubicaciones de asistencias REALES', async () => {
    const body = UserAffinityResponseSchema.parse((await get(`/api/v2/users/${CODE_MAIN}/affinity`)).json());
    expect(body.totalAttended).toBe(2); // a1 + a2 (a3 es RSVP, no cuenta)
    expect(body.byType.map((b) => b.key).sort()).toEqual(['Cine', 'Concierto']);
    expect(body.byLocation.map((b) => b.key).sort()).toEqual(['Sala 1', 'Sala 2']);
    expect(body.byCategory.map((b) => b.key)).toEqual(['Música']); // a2 category null → excluida
    expect(body.lastVisitAt).not.toBeNull();
    expect(body.status).toBe('active');
  });

  it('afinidad vacía: nunca visitó → buckets vacíos + status dormant', async () => {
    const body = UserAffinityResponseSchema.parse((await get(`/api/v2/users/${CODE_EMPTY}/affinity`)).json());
    expect(body.totalAttended).toBe(0);
    expect(body.byType).toEqual([]);
    expect(body.byLocation).toEqual([]);
    expect(body.lastVisitAt).toBeNull();
    expect(body.status).toBe('dormant'); // nunca visitó
  });

  it('tenant/roles: cross-tenant 403; sin sesión 401 (detalle/historial/afinidad)', async () => {
    expect((await get(`/api/v2/users/${CODE_MAIN}`, hostA, TOK.b)).statusCode).toBe(403);
    expect((await get(`/api/v2/users/${CODE_MAIN}`, hostA, null)).statusCode).toBe(401);
    expect((await get(`/api/v2/users/${CODE_MAIN}/activities`, hostA, null)).statusCode).toBe(401);
    expect((await get(`/api/v2/users/${CODE_MAIN}/affinity`, hostA, null)).statusCode).toBe(401);
  });
});
