// apps/api-v2/test/puerta.test.ts · registro de puerta de salas permanentes.
// PG efímero (skip sin DATABASE_URL). Cada entrada cuenta; grupos = profesor + alumnos.

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

run('puerta · salas permanentes', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `pta-${stamp}`; const host = `${slug}.contan2.com`;
  const tok = `pta-tok-${stamp}`;
  const tokPuerta = `pta-pta-${stamp}`; // sesión de un staff con rol 'puerta'
  let orgId: string; let salaId: string; let userCode: string;

  const get = (url: string) => app.inject({ method: 'GET', url, headers: { host, cookie: `contan2_session=${tok}` } });
  const post = (url: string, body: unknown) => app.inject({ method: 'POST', url, headers: { host, cookie: `contan2_session=${tok}`, 'content-type': 'application/json' }, payload: body ?? {} });

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'PTA' }).returning('id').executeTakeFirstOrThrow()).id;
    const staff = await db.insertInto('staff_members').values({ organization_id: orgId, email: `s-${stamp}@t.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: staff.id, token_hash: hashToken(tok), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    // Staff con rol 'puerta' (departamento de salas permanentes) para probar el RBAC.
    const pta = await db.insertInto('staff_members').values({ organization_id: orgId, email: `pta-role-${stamp}@t.local`, password_hash: 'x', full_name: 'Puerta', status: 'active', role: 'puerta' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: pta.id, token_hash: hashToken(tokPuerta), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    // sala permanente tipo VR (aforo 8)
    salaId = randomUUID();
    await db.insertInto('activities').values({ id: salaId, organization_id: orgId, name: 'Sala VR', type: 'otro', location: 'Lobby', date: new Date().toISOString(), capacity: 8, enrolled_count: 0, status: 'activa', description: '', image_url: null, is_permanent: true, audience: 'infantil' } as never).execute();
    const u = await db.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code: 'PTA-AB12CD', first_name: 'Ana', last_name: 'Gómez', email: null, phone: null, visit_count: 0 } as never).returning('code').executeTakeFirstOrThrow();
    userCode = u.code;
    app = buildApp(); await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db.deleteFrom('space_bookings').where('organization_id', '=', orgId).execute();
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
    // la asistencia del grupo guarda colegio/nivel/profesor (kind null = colegio)
    const grp = await db.selectFrom('attendance').select(['group_label', 'group_kind', 'group_level', 'group_contact', 'companions_children']).where('activity_id', '=', salaId).where('group_label', 'is not', null).executeTakeFirstOrThrow();
    expect(grp.group_label).toBe('Colegio San José');
    expect(grp.group_kind).toBeNull();
    expect(grp.group_contact).toBe('María Objío');
    expect(grp.companions_children).toBe(35);
  });

  it('grupo con kind customizado: guarda group_kind y etiqueta "integrantes"', async () => {
    const rg = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'group', group: { colegio: 'Jóvenes de Villa Consuelo', kind: 'Grupo comunitario', level: '14-17 años', contactName: 'Pedro Núñez', studentCount: 12 } });
    expect(rg.statusCode).toBe(201);
    expect(rg.json().registered[0].partySize).toBe(13);
    expect(rg.json().visitor).toBe('Jóvenes de Villa Consuelo (12 integrantes)');
    const grp = await db.selectFrom('attendance').select(['group_kind', 'group_contact']).where('activity_id', '=', salaId).where('group_label', '=', 'Jóvenes de Villa Consuelo').executeTakeFirstOrThrow();
    expect(grp.group_kind).toBe('Grupo comunitario');
    expect(grp.group_contact).toBe('Pedro Núñez');
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

  it('mode new: crea el visitante (code) + acompañantes por audiencia; cada entrada cuenta; find-or-create por email', async () => {
    // Nuevo visitante con 2 acompañantes → party 3; sala infantil → children.
    const r = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'new', companions: 2, visitor: { firstName: 'Juan', lastName: 'Pérez', email: 'juan@x.do', phone: '809-1' } });
    expect(r.statusCode).toBe(201);
    expect(r.json().visitor).toContain('Juan');
    expect(r.json().code).toMatch(/^PTA-/); // credencial minteada
    expect(r.json().registered[0].partySize).toBe(3);
    const created = await db.selectFrom('users').select(['id', 'code', 'visit_count']).where('organization_id', '=', orgId).where('email', '=', 'juan@x.do').executeTakeFirstOrThrow();
    expect(created.code).toBe(r.json().code);
    // El acompañante fue a children (audiencia infantil).
    const att = await db.selectFrom('attendance').select(['companions_children', 'companions_adults', 'anonymous']).where('user_code', '=', created.code).executeTakeFirstOrThrow();
    expect(att.companions_children).toBe(2);
    expect(att.companions_adults).toBe(0);
    expect(att.anonymous).toBe(false);

    // find-or-create: re-registrar con el MISMO email → mismo user (no duplica), +visita.
    const r2 = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'new', visitor: { firstName: 'Juan', lastName: 'Pérez', email: 'juan@x.do' } });
    expect(r2.json().code).toBe(created.code);
    expect((await db.selectFrom('users').select((eb) => eb.fn.countAll<string>().as('n')).where('organization_id', '=', orgId).where('email', '=', 'juan@x.do').executeTakeFirstOrThrow()).n).toBe('1');
    const after = await db.selectFrom('users').select('visit_count').where('id', '=', created.id).executeTakeFirstOrThrow();
    expect(Number(after.visit_count)).toBe(2); // creado en 1, +1 al reusar
    // 2 entradas del mismo Juan (cada entrada cuenta, sin dedup).
    expect((await db.selectFrom('attendance').select((eb) => eb.fn.countAll<string>().as('n')).where('user_code', '=', created.code).executeTakeFirstOrThrow()).n).toBe('2');

    // identified con acompañantes: Ana + 1 → party 2.
    const ri = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'identified', code: userCode, companions: 1 });
    expect(ri.json().registered[0].partySize).toBe(2);

    // new sin visitor → 400.
    expect((await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'new' })).statusCode).toBe(400);
  });

  it('mode new: find-or-create por TELÉFONO exacto (normalizado) — no duplica el padrón', async () => {
    const r1 = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'new', visitor: { firstName: 'Rosa', lastName: 'Duarte', phone: '809-555-7777' } });
    expect(r1.statusCode).toBe(201);
    const code = r1.json().code as string;
    // Mismo teléfono con otro formato (espacios, 1 de país) → MISMO usuario.
    const r2 = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'new', visitor: { firstName: 'Rosa', lastName: 'Duarte', phone: '1 (809) 555 7777' } });
    expect(r2.json().code).toBe(code);
    const n = await db.selectFrom('users').select((eb) => eb.fn.countAll<string>().as('n'))
      .where('organization_id', '=', orgId).where('phone', '=', '809-555-7777').executeTakeFirstOrThrow();
    expect(n.n).toBe('1');
    // Teléfono corto (<7 dígitos) NO matchea → crea usuario aparte (sin falsos positivos).
    const r3 = await post('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'new', visitor: { firstName: 'Otra', lastName: 'Persona', phone: '809-55' } });
    expect(r3.json().code).not.toBe(code);
  });

  it('export.xlsx: descarga la data de las salas (ambas y filtrada a una) → 200 xlsx', async () => {
    const res = await get('/api/v2/puerta/export.xlsx');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(String(res.headers['content-disposition'])).toContain('.xlsx');
    // filtrada a la sala VR
    expect((await get(`/api/v2/puerta/export.xlsx?sala=${salaId}`)).statusCode).toBe(200);
    // rango válido
    expect((await get('/api/v2/puerta/export.xlsx?from=2020-01-01&to=2099-12-31')).statusCode).toBe(200);
  });

  it('rol puerta: escribe en su módulo + lee registros/protocolo + exporta; 403 en equipo y en protocolo-write', async () => {
    const h = (url: string) => app.inject({ method: 'GET', url, headers: { host, cookie: `contan2_session=${tokPuerta}` } });
    const p = (url: string, body?: unknown) => app.inject({ method: 'POST', url, headers: { host, cookie: `contan2_session=${tokPuerta}`, 'content-type': 'application/json' }, payload: body ?? {} });
    // Su módulo (Puerta): registra y exporta.
    expect((await p('/api/v2/puerta/registrar', { salaIds: [salaId], mode: 'anonymous' })).statusCode).toBe(201);
    expect((await h('/api/v2/puerta/export.xlsx')).statusCode).toBe(200);
    // Registros (historial) → lee.
    expect((await h('/api/v2/org/audit')).statusCode).toBe(200);
    // Protocolo → lee (directorio).
    expect((await h('/api/v2/protocol')).statusCode).toBe(200);
    // Equipo → 403 (fuera de su alcance).
    expect((await h('/api/v2/org/team/overview')).statusCode).toBe(403);
    // Protocolo ESCRITURA → 403 (solo lectura).
    expect((await p('/api/v2/protocol', {})).statusCode).toBe(403);
  });

  it('stats: KPIs en PERSONAS consistentes con visitorsToday; grupos, composición, por sala y reservas', async () => {
    // Hoy en la TZ de la puerta (los registros de los tests son de "ahora").
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const range = `from=${today}&to=${today}`;

    // Sin cookie → 401 · rango inválido → 400 · sala inexistente → 404.
    expect((await app.inject({ method: 'GET', url: `/api/v2/puerta/stats?${range}`, headers: { host } })).statusCode).toBe(401);
    expect((await get('/api/v2/puerta/stats?from=2026&to=hoy')).statusCode).toBe(400);
    expect((await get(`/api/v2/puerta/stats?${range}&sala=${randomUUID()}`)).statusCode).toBe(404);

    // Reservas de HOY para el funnel: confirmada + asistió + no vino.
    const bk = (status: string) => db.insertInto('space_bookings').values({
      organization_id: orgId, activity_id: salaId, scheduled_at: new Date().toISOString(),
      colegio: `Colegio Stats ${status}`, level: null, group_kind: null,
      contact_name: 'Prof. Stats', contact_email: null, contact_phone: null,
      student_count: 10, status, notes: null,
    } as never).execute();
    await bk('confirmed'); await bk('attended'); await bk('no_show');

    const salasRes = (await get('/api/v2/puerta/salas')).json();
    const salaHoy = salasRes.salas.find((s: { id: string }) => s.id === salaId);
    // visitorsWeek acompaña a visitorsToday en las tarjetas del board.
    expect(salaHoy.visitorsWeek).toBeGreaterThanOrEqual(salaHoy.visitorsToday);

    const res = await get(`/api/v2/puerta/stats?${range}`);
    expect(res.statusCode).toBe(200);
    const s = res.json();
    // KPIs de personas = lo que muestran las tarjetas del board (misma métrica).
    const totalToday = salasRes.salas.reduce((a: number, x: { visitorsToday: number }) => a + x.visitorsToday, 0);
    expect(s.kpis.people).toBe(totalToday);
    expect(s.kpis.entries).toBeGreaterThan(0);
    expect(s.kpis.people).toBeGreaterThanOrEqual(s.kpis.entries);
    // Particiones consistentes: composición y por-sala suman las mismas personas.
    const compSum = s.composition.reduce((a: number, c: { people: number }) => a + c.people, 0);
    expect(compSum).toBe(s.kpis.people);
    const bySalaSum = s.bySala.reduce((a: number, x: { people: number }) => a + x.people, 0);
    expect(bySalaSum).toBe(s.kpis.people);
    // Grupos del período: el colegio registrado en los tests aparece con personas.
    const sanJose = s.groups.find((g: { label: string }) => g.label === 'Colegio San José');
    expect(sanJose).toBeTruthy();
    expect(sanJose.people).toBe(36); // 1 profesor + 35 alumnos
    expect(sanJose.kind).toBeNull(); // null = colegio
    // Serie diaria de 1 día (hoy) con el total; sin período anterior → deltas null.
    expect(s.daily).toHaveLength(1);
    expect(s.daily[0].current).toBe(totalToday);
    expect(s.deltas.people).toBeNull();
    // Reservas del período: funnel + tasa de asistencia 50% (1 asistió / 2 decididas).
    expect(s.bookings.confirmed).toBe(1);
    expect(s.bookings.attended).toBe(1);
    expect(s.bookings.noShow).toBe(1);
    expect(s.bookings.peopleExpected).toBe(33); // 3 reservas × (10 alumnos + 1 prof)
    expect(s.bookings.attendedPct).toBe(50);

    // Filtro por sala: en este suite todo pasó en la sala VR → mismos totales,
    // y bySala (comparativa) la sigue incluyendo.
    const rf = await get(`/api/v2/puerta/stats?${range}&sala=${salaId}`);
    expect(rf.statusCode).toBe(200);
    expect(rf.json().kpis.people).toBe(salaHoy.visitorsToday);

    // El rol 'puerta' también lee sus estadísticas.
    const rp = await app.inject({ method: 'GET', url: `/api/v2/puerta/stats?${range}`, headers: { host, cookie: `contan2_session=${tokPuerta}` } });
    expect(rp.statusCode).toBe(200);
  });
});
