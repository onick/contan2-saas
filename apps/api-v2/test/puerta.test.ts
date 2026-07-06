// apps/api-v2/test/puerta.test.ts · registro de puerta de salas permanentes.
// PG efímero (skip sin DATABASE_URL). Cada entrada cuenta; grupos = profesor + alumnos.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createDb, type Database } from '@contan2/db';
import type { Kysely } from 'kysely';
import { buildApp } from '../src/server.js';
import { hashToken } from '@contan2/auth';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('puerta · salas permanentes', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `pta-${stamp}`; const host = `${slug}.contan2.com`;
  const tok = `pta-tok-${stamp}`;
  let orgId: string; let salaId: string; let userCode: string;

  const get = (url: string) => app.inject({ method: 'GET', url, headers: { host, cookie: `contan2_session=${tok}` } });
  const post = (url: string, body: unknown) => app.inject({ method: 'POST', url, headers: { host, cookie: `contan2_session=${tok}`, 'content-type': 'application/json' }, payload: body ?? {} });

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'PTA' }).returning('id').executeTakeFirstOrThrow()).id;
    const staff = await db.insertInto('staff_members').values({ organization_id: orgId, email: `s-${stamp}@t.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: staff.id, token_hash: hashToken(tok), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    // sala permanente tipo VR (aforo 8)
    salaId = randomUUID();
    await db.insertInto('activities').values({ id: salaId, organization_id: orgId, name: 'Sala VR', type: 'otro', location: 'Lobby', date: new Date().toISOString(), capacity: 8, enrolled_count: 0, status: 'activa', description: '', image_url: null, is_permanent: true, audience: 'infantil' } as never).execute();
    const u = await db.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code: 'PTA-AB12CD', first_name: 'Ana', last_name: 'Gómez', email: null, phone: null, visit_count: 0 } as never).returning('code').executeTakeFirstOrThrow();
    userCode = u.code;
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('salas: 401 sin cookie; 200 con la sala permanente (aforo 8, sin visitas)', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v2/puerta/salas', headers: { host } })).statusCode).toBe(401);
    const res = await get('/api/v2/puerta/salas');
    expect(res.statusCode).toBe(200);
    const sala = res.json().salas.find((s: { id: string }) => s.id === salaId);
    expect(sala).toBeTruthy();
    expect(sala.aforo).toBe(8);
    expect(sala.visitorsToday).toBe(0);
  });

  it('registrar identificado / anónimo / grupo · cada entrada cuenta', async () => {
    // identificado por código
    const r1 = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'identified', code: userCode });
    expect(r1.statusCode).toBe(201);
    expect(r1.json().visitor).toContain('Ana');
    // código inexistente → 404
    expect((await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'identified', code: 'PTA-ZZZZZZ' })).statusCode).toBe(404);
    // anónimo
    expect((await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'anonymous' })).statusCode).toBe(201);
    // grupo: profesor + 35 alumnos = 36
    const rg = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'group', group: { colegio: 'Colegio San José', level: '5.º prim', contactName: 'María Objío', studentCount: 35 } });
    expect(rg.statusCode).toBe(201);
    expect(rg.json().registered[0].partySize).toBe(36);

    // visitantes hoy = 1 (ana) + 1 (anon) + 36 (grupo) = 38 · cada entrada cuenta
    const salas = await get('/api/v2/puerta/salas');
    expect(salas.json().salas.find((s: { id: string }) => s.id === salaId).visitorsToday).toBe(38);
    // la asistencia del grupo guarda colegio/nivel/profesor
    const grp = await db.selectFrom('attendance').select(['group_label', 'group_level', 'group_contact', 'companions_children']).where('activity_id', '=', salaId).where('group_label', 'is not', null).executeTakeFirstOrThrow();
    expect(grp.group_label).toBe('Colegio San José');
    expect(grp.group_contact).toBe('María Objío');
    expect(grp.companions_children).toBe(35);
  });

  it('ocupación: +1 sube, se clampa al aforo; 404 sala inexistente', async () => {
    const r = await post(`/api/v2/puerta/salas/${salaId}/occupancy`, { delta: 3 });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ occupancy: 3, aforo: 8 });
    // clamp al aforo
    expect((await post(`/api/v2/puerta/salas/${salaId}/occupancy`, { delta: 20 })).json().occupancy).toBe(8);
    // clamp a 0
    expect((await post(`/api/v2/puerta/salas/${salaId}/occupancy`, { delta: -50 })).json().occupancy).toBe(0);
    expect((await post(`/api/v2/puerta/salas/00000000-0000-0000-0000-000000000000/occupancy`, { delta: 1 })).statusCode).toBe(404);
  });
});
