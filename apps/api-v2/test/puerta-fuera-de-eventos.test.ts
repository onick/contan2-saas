// apps/api-v2/test/puerta-fuera-de-eventos.test.ts · PUE-A02 (decisión P1).
// Las salas permanentes quedan FUERA de los eventos: no cuentan en la barra ni en
// el Inicio, no se listan en Actividades y no se pueden mutar desde ahí (409).
// "Salas hoy" aparte. PG efímero (skip sin DATABASE_URL).

process.env.ROOT_DOMAIN = 'contan2.com';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createDb, type Database } from '@contan2/db';
import type { Kysely } from 'kysely';
import { buildApp } from '../src/server.js';
import { hashToken } from '@contan2/auth';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('PUE-A02 · salas fuera de los eventos', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `pfe-${stamp}`; const host = `${slug}.contan2.com`;
  const tok = `pfe-tok-${stamp}`; const tokConsulta = `pfe-con-${stamp}`;
  let orgId: string; let salaId: string; let eventId: string;

  const h = (t = tok) => ({ host, cookie: `contan2_session=${t}`, 'content-type': 'application/json' });
  const get = (url: string, t = tok) => app.inject({ method: 'GET', url, headers: h(t) });
  const patch = (url: string, body: unknown) => app.inject({ method: 'PATCH', url, headers: h(), payload: body as never });

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'PFE' }).returning('id').executeTakeFirstOrThrow()).id;
    const mk = async (role: string, t: string, n: string) => {
      const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${n}-${stamp}@t.local`, password_hash: 'x', full_name: n, status: 'active', role } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(t), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    };
    await mk('admin', tok, 'adm'); await mk('consulta', tokConsulta, 'con');
    salaId = randomUUID(); eventId = randomUUID();
    const base = { organization_id: orgId, type: 'otro', location: 'Lobby', capacity: 100000, enrolled_count: 0, status: 'activa', description: '', image_url: null } as const;
    await db.insertInto('activities').values({ ...base, id: salaId, name: 'Sala Ada PFE', date: new Date().toISOString(), is_permanent: true } as never).execute();
    await db.insertInto('activities').values({ ...base, id: eventId, name: 'Concierto PFE', capacity: 50, date: new Date(Date.now() + 5 * 86_400_000).toISOString(), is_permanent: false } as never).execute();
    // 5 personas hoy en la sala (check-ins anónimos) + 1 check-in al evento.
    for (let i = 0; i < 5; i += 1) {
      await db.insertInto('attendance').values({ id: randomUUID(), organization_id: orgId, activity_id: salaId, activity_name: 'Sala Ada PFE', user_id: null, user_code: null, anonymous: true, is_permanent: true, checked_in_at: new Date().toISOString() } as never).execute();
    }
    await db.insertInto('attendance').values({ id: randomUUID(), organization_id: orgId, activity_id: eventId, activity_name: 'Concierto PFE', user_id: null, user_code: null, anonymous: true, checked_in_at: new Date().toISOString() } as never).execute();
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('/shell/summary: checkinsToday y activeActivities solo cuentan el evento', async () => {
    const b = (await get('/api/v2/shell/summary')).json().badges;
    expect(b.checkinsToday).toBe(1);
    expect(b.checkinsTodayRecords).toBe(1);
    expect(b.activeActivities).toBe(1);
  });

  it('/dashboard/metrics: sin salas', async () => {
    const m = (await get('/api/v2/dashboard/metrics')).json().metrics;
    expect(m.totalActivities).toBe(1);
    expect(m.activeActivities).toBe(1);
    expect(m.totalAttendance).toBe(1);
    expect(m.checkedIn).toBe(1);
  });

  it('/dashboard/overview: KPIs de eventos y "Salas hoy" = 5', async () => {
    const o = (await get('/api/v2/dashboard/overview?period=today')).json();
    expect(o.attendance.current).toBe(1);
    expect(o.series.reduce((a: number, p: { value: number }) => a + p.value, 0)).toBe(1);
    expect(o.topActivities.map((a: { id: string }) => a.id)).not.toContain(salaId);
    expect(o.upcoming.id).toBe(eventId);
    expect(o.salasHoy.people).toBe(5);
    expect(o.salasHoy.salas).toEqual([{ id: salaId, name: 'Sala Ada PFE', people: 5 }]);
  });

  it('/dashboard/overview: "Salas hoy" no se expone al rol sin acceso a Puerta', async () => {
    const o = (await get('/api/v2/dashboard/overview?period=today', tokConsulta)).json();
    expect(o.salasHoy ?? null).toBeNull();
  });

  it('/activities y el buscador global no listan la sala; el detalle sí, marcado isPermanent', async () => {
    const list = (await get('/api/v2/activities')).json();
    expect(list.items.map((a: { id: string }) => a.id)).toEqual([eventId]);
    expect(list.total).toBe(1);
    const s = (await get('/api/v2/search?q=PFE')).json();
    expect(s.activities.map((a: { id: string }) => a.id)).toEqual([eventId]);
    const d = await get(`/api/v2/activities/${salaId}`);
    expect(d.statusCode).toBe(200);
    expect(d.json().isPermanent).toBe(true);
    expect((await get(`/api/v2/activities/${eventId}`)).json().isPermanent).toBe(false);
  });

  it('PATCH / estado / portada / DELETE de una sala → 409 con el texto de Puerta', async () => {
    const msg = 'Esta sala permanente se gestiona desde Puerta.';
    const r1 = await patch(`/api/v2/activities/${salaId}`, { capacity: 500 });
    expect(r1.statusCode).toBe(409); expect(r1.json().error).toBe(msg);
    const r2 = await patch(`/api/v2/activities/${salaId}/status`, { status: 'finalizada' });
    expect(r2.statusCode).toBe(409); expect(r2.json().error).toBe(msg);
    const r3 = await app.inject({ method: 'POST', url: `/api/v2/activities/${salaId}/cover`, headers: h(), payload: {} });
    expect(r3.statusCode).toBe(409);
    const r4 = await app.inject({ method: 'DELETE', url: `/api/v2/activities/${salaId}`, headers: { host, cookie: `contan2_session=${tok}` } });
    expect(r4.statusCode).toBe(409);
    const row = await db.selectFrom('activities').select(['status', 'capacity']).where('id', '=', salaId).executeTakeFirstOrThrow();
    expect(row).toEqual({ status: 'activa', capacity: 100000 });
    // Un evento normal sigue editable.
    expect((await patch(`/api/v2/activities/${eventId}`, { capacity: 60 })).statusCode).toBe(200);
  });
});
