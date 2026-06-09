// apps/api-v2/test/users-cohorts.test.ts · integration (skip sin DATABASE_URL).
// User Intelligence UI-1: cohortes + conteos (facets) + última visita + estado de
// credencial. Siembra un set controlado en orgA (con fechas de visita exactas para
// los límites 30/90 días) y un orgB para aislamiento. Valida el shape con los
// schemas Zod de @contan2/contracts.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { UsersListResponseSchema, UsersFacetsResponseSchema } from '@contan2/contracts';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

run('users · cohortes + facets + última visita (UI-1)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `uic-a-${stamp}`;
  const slugB = `uic-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { a: `uic-tok-a-${stamp}`, b: `uic-tok-b-${stamp}` };

  const ids: Record<string, string> = {};

  const mkOrg = async (slug: string) => {
    const o = await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active' })
      .returning('id').executeTakeFirstOrThrow();
    return o.id;
  };
  const mkStaff = async (orgId: string, token: string) => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `staff-${orgId.slice(0, 8)}-${stamp}@test.local`,
      password_hash: 'x', full_name: 'UIC Staff', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };

  // Visita: una asistencia con checked_in_at en una fecha concreta (última visita).
  const mkVisit = async (orgId: string, userId: string, code: string, activityId: string, checkedDaysAgo: number) => {
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, user_id: userId, user_code: code,
      activity_id: activityId, activity_name: 'Concierto', anonymous: false,
      checked_in_at: daysAgoIso(checkedDaysAgo),
    }).execute();
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.a);
    await mkStaff(orgBId, TOK.b);

    const actId = randomUUID();
    await db.insertInto('activities').values({
      id: actId, organization_id: orgAId, name: 'Concierto', type: 'Concierto',
      location: 'Sala 1', date: new Date().toISOString(), capacity: 100, status: 'activa',
    }).execute();

    // Set controlado. visit_count materializado; created_at y última visita exactos.
    // [code, first, last, email, phone, visit_count, credential_sent_at, created_daysAgo, checked_daysAgo|null]
    const seed: Array<[string, string, string, string | null, string | null, number, string | null, number, number | null]> = [
      ['CCB-FREQ01', 'Frecuente', 'Activa', 'freq@ccb.do', '809-555-7777', 5, daysAgoIso(10), 10, 0],    // frequent + active + cred enviada
      ['CCB-NEW001', 'Nuevo', 'Reciente', 'new@ccb.do', null, 1, null, 2, 0],                            // new7d + active + noCredential
      ['CCB-NOML01', 'SinMail', 'Persona', null, null, 2, null, 200, 200],                               // noEmail + dormant
      ['CCB-NVR001', 'Nunca', 'Visito', 'never@ccb.do', null, 0, daysAgoIso(300), 300, null],            // nunca visitó → dormant
      ['CCB-MID001', 'Intermedia', 'Zona', 'mid@ccb.do', null, 4, daysAgoIso(60), 60, 60],               // frequent + 31–90 (status null)
      ['CCB-OLD001', 'Viejo', 'Inactivo', 'old@ccb.do', null, 1, null, 100, 100],                        // dormant + noCredential
    ];
    for (const [code, fn, ln, email, phone, vc, credAt, createdDaysAgo, checkedDaysAgo] of seed) {
      const id = randomUUID();
      ids[code] = id;
      await db.insertInto('users').values({
        id, organization_id: orgAId, code, first_name: fn, last_name: ln, email, phone,
        visit_count: vc, credential_sent_at: credAt, created_at: daysAgoIso(createdDaysAgo),
      }).execute();
      if (checkedDaysAgo !== null) await mkVisit(orgAId, id, code, actId, checkedDaysAgo);
    }

    // orgB: un usuario para aislamiento.
    await db.insertInto('users').values({
      id: randomUUID(), organization_id: orgBId, code: 'MEM-UICB01', first_name: 'Ajeno', last_name: 'Tenant', email: 'ajeno@b.do', phone: null, visit_count: 9,
    }).execute();

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

  // token=null → sin sesión (no usar undefined: dispararía el default param).
  const get = (url: string, host = hostA, token: string | null = TOK.a) =>
    app.inject({ method: 'GET', url, headers: { host }, ...(token ? { cookies: { contan2_session: token } } : {}) });

  const list = async (qs: string) => UsersListResponseSchema.parse((await get(`/api/v2/users?${qs}`)).json());
  const codes = (body: { items: Array<{ code: string }> }) => body.items.map((i) => i.code).sort();

  it('facets · conteos EXACTOS por cohorte, tenant-scoped', async () => {
    const { counts } = UsersFacetsResponseSchema.parse((await get('/api/v2/users/facets')).json());
    expect(counts.all).toBe(6);
    expect(counts.frequent).toBe(2);    // FREQ(5), MID(4)
    expect(counts.new7d).toBe(1);       // NEW
    expect(counts.noEmail).toBe(1);     // NOML
    expect(counts.noCredential).toBe(2);// NEW, OLD (email + credential null)
    expect(counts.active).toBe(2);      // FREQ, NEW (≤30d)
    expect(counts.dormant).toBe(3);     // NOML(200), NVR(nunca), OLD(100)
  });

  it('cohorte frequent → visit_count >= 3', async () => {
    expect(codes(await list('cohort=frequent'))).toEqual(['CCB-FREQ01', 'CCB-MID001']);
  });

  it('cohorte active (≤30d) y dormant (>90d o nunca)', async () => {
    expect(codes(await list('cohort=active'))).toEqual(['CCB-FREQ01', 'CCB-NEW001']);
    expect(codes(await list('cohort=dormant'))).toEqual(['CCB-NOML01', 'CCB-NVR001', 'CCB-OLD001']);
  });

  it('límites: nunca visitó → dormant; zona 31–90 → status null (sin etiqueta)', async () => {
    const dormant = await list('cohort=dormant');
    const never = dormant.items.find((u) => u.code === 'CCB-NVR001')!;
    expect(never.lastVisitAt).toBeNull();
    expect(never.status).toBe('dormant');

    const all = await list('cohort=all&limit=100');
    const mid = all.items.find((u) => u.code === 'CCB-MID001')!;
    expect(mid.status).toBeNull(); // 31–90 días: sin etiqueta active/dormant
    // y NO aparece ni en active ni en dormant
    expect((await list('cohort=active')).items.some((u) => u.code === 'CCB-MID001')).toBe(false);
    expect((await list('cohort=dormant')).items.some((u) => u.code === 'CCB-MID001')).toBe(false);
  });

  it('noCredential exige email presente + credential_sent_at null', async () => {
    const body = await list('cohort=noCredential');
    expect(codes(body)).toEqual(['CCB-NEW001', 'CCB-OLD001']);
    // el sin-email NO cuenta como noCredential
    expect(body.items.some((u) => u.code === 'CCB-NOML01')).toBe(false);
  });

  it('lastVisitAt y credentialSentAt correctos', async () => {
    const all = await list('cohort=all&limit=100');
    const freq = all.items.find((u) => u.code === 'CCB-FREQ01')!;
    expect(freq.credentialSentAt).not.toBeNull();
    expect(freq.lastVisitAt).not.toBeNull();
    expect(Date.now() - new Date(freq.lastVisitAt!).getTime()).toBeLessThan(2 * 86_400_000); // ~hoy
    const newU = all.items.find((u) => u.code === 'CCB-NEW001')!;
    expect(newU.credentialSentAt).toBeNull();
  });

  it('búsqueda por teléfono (server-side)', async () => {
    expect(codes(await list('q=809-555-7777'))).toEqual(['CCB-FREQ01']);
  });

  it('cohorte + búsqueda + paginación combinadas', async () => {
    // frequent = {FREQ, MID}; con q=Intermedia → solo MID. total exacto del filtro.
    const body = await list('cohort=frequent&q=Intermedia');
    expect(body.total).toBe(1);
    expect(codes(body)).toEqual(['CCB-MID001']);
    // paginación dentro de all: limit 2 → 2 items, total 6
    const p = await list('cohort=all&limit=2&offset=0');
    expect(p.total).toBe(6);
    expect(p.items.length).toBe(2);
  });

  it('aislamiento de tenant: facets/listado no cuentan orgB; cross-tenant 403; sin sesión 401', async () => {
    const { counts } = UsersFacetsResponseSchema.parse((await get('/api/v2/users/facets')).json());
    expect(counts.all).toBe(6); // no incluye al usuario de orgB
    expect((await get('/api/v2/users', hostA, TOK.b)).statusCode).toBe(403); // sesión de orgB en host de orgA
    expect((await get('/api/v2/users', hostA, null)).statusCode).toBe(401);
    expect((await get('/api/v2/users/facets', hostA, null)).statusCode).toBe(401);
  });
});
