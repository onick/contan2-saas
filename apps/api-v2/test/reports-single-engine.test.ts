// apps/api-v2/test/reports-single-engine.test.ts · PR-R3 refactor/reports-single-engine.
// "Una cifra, cuatro salidas": dashboard (period-summary JSON), XLSX, HTML del PDF y
// Asistente dan las MISMAS personas, registros, únicos, ocupación y período anterior
// (REP-A03/A09/A10/A11/A12/A20 · decisiones P2 y P4).

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';
process.env.CHECKIN_TZ = 'America/Santo_Domingo';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, withTenant, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { parseRange } from '../src/services/report-data.js';
import { periodEngine } from '../src/services/reports/period-engine.js';
import { buildPeriodPdfHtml } from '../src/services/reports/period-pdf-template.js';
import { runAgentQuery } from '../src/services/reports/agent.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('reportes · un solo motor de período (integración)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `repeng-${stamp}`;
  const host = `${slug}.contan2.com`;
  const TOK = `repeng-adm-${stamp}`;
  const FROM = '2026-07-01';
  const TO = '2026-07-19';
  let orgId: string;
  let ip = 0;
  const organization = { name: 'Centro Motor', slug, primaryColor: '#f39228', secondaryColor: '#31a3db', logoUrl: null, credentialLogoUrl: null };
  const get = (url: string) => app.inject({
    method: 'GET', url: `/api/v2${url}`,
    headers: { host, 'x-forwarded-for': `10.8.0.${(ip++ % 250) + 1}`, cookie: `contan2_session=${TOK}` },
  });

  const mkUser = async (first: string) => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: orgId, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: first, last_name: 'Motor', email: `${first.toLowerCase()}-${stamp}@secreto.test`, phone: '809-555-0100', visit_count: 3,
    } as never).execute();
    return id;
  };
  const mkAct = async (o: { name: string; type: string; date: string; capacity: number; status?: string; permanent?: boolean; category?: string }) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: orgId, name: o.name, type: o.type, location: 'Sala', date: o.date,
      capacity: o.capacity, enrolled_count: 0, status: o.status ?? 'finalizada', description: '', image_url: null,
      category: o.category ?? null, is_permanent: o.permanent ?? false,
    } as never).execute();
    return id;
  };
  const att = async (act: string, o: { user?: string | null; children?: number; adults?: number; hold?: boolean; at: string }) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, user_id: o.user ?? null, activity_id: act, activity_name: 'x',
      user_code: null, anonymous: !o.user, companions_children: o.children ?? 0, companions_adults: o.adults ?? 0,
      registered_at: o.at, checked_in_at: o.hold ? null : o.at,
    } as never).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'Centro Motor', status: 'active', primary_color: '#f39228' } as never).returning('id').executeTakeFirstOrThrow()).id;
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `adm-eng-${stamp}@t.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(TOK), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    const [u1, u2, u3, u4] = [await mkUser('Ana'), await mkUser('Beto'), await mkUser('Carla'), await mkUser('Dani')];

    // Julio (actual): A cine aforo 100, B taller aforo 50.
    const a = await mkAct({ name: 'Cine A', type: 'cine', date: '2026-07-10T20:00:00Z', capacity: 100, category: 'Ciclo Motor' });
    await att(a, { user: u1, children: 1, adults: 1, at: '2026-07-10T20:10:00Z' }); // 3 personas
    await att(a, { user: u2, at: '2026-07-10T20:11:00Z' });                          // 1
    await att(a, { user: null, at: '2026-07-10T20:12:00Z' });                        // anónimo: 1
    await att(a, { user: null, children: 1, at: '2026-07-10T20:13:00Z' });           // anónimo +1 niño: 2
    await att(a, { user: u3, hold: true, at: '2026-07-10T20:14:00Z' });              // reserva: no cuenta
    const b = await mkAct({ name: 'Taller B', type: 'taller', date: '2026-07-12T20:00:00Z', capacity: 50 });
    await att(b, { user: u1, at: '2026-07-12T20:05:00Z' }); // visitante que repite
    await att(b, { user: u3, at: '2026-07-12T20:06:00Z' });
    // Sala permanente y actividad cancelada: fuera del motor.
    const sala = await mkAct({ name: 'Sala Ada', type: 'otro', date: '2026-07-08T14:00:00Z', capacity: 100000, status: 'activa', permanent: true });
    await att(sala, { user: u4, at: '2026-07-09T15:00:00Z' });
    const canc = await mkAct({ name: 'Cancelada', type: 'cine', date: '2026-07-15T16:00:00Z', capacity: 50, status: 'cancelada' });
    await att(canc, { user: u4, children: 2, at: '2026-07-15T16:05:00Z' });
    // Junio (mismo tramo 1..19): C aforo 40; D del 25-jun queda FUERA del tramo.
    const c = await mkAct({ name: 'Cine C', type: 'cine', date: '2026-06-10T20:00:00Z', capacity: 40 });
    await att(c, { user: u1, children: 2, at: '2026-06-10T20:10:00Z' }); // 3
    await att(c, { user: u4, at: '2026-06-10T20:11:00Z' });              // 1
    const d = await mkAct({ name: 'Cine D', type: 'cine', date: '2026-06-25T20:00:00Z', capacity: 40 });
    for (let i = 0; i < 5; i++) await att(d, { user: null, at: '2026-06-25T20:10:00Z' });

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) {
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in', db.selectFrom('staff_members').select('id').where('organization_id', '=', orgId)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  // Valores esperados (fixture): julio -> 2 actividades, 6 registros, 9 personas, 3 únicos, aforo 150 -> 6 %.
  // Junio 1..19 -> 1 actividad, 2 registros, 4 personas, 2 únicos, aforo 40 -> 10 %.
  const EXPECT = {
    cur: { activities: 2, attendances: 6, people: 9, uniqueVisitors: 3, occupancyPct: 6 },
    prev: { activities: 1, attendances: 2, people: 4, uniqueVisitors: 2, occupancyPct: 10 },
    prevRange: { from: '2026-06-01', to: '2026-06-19' },
  };

  it('motor: KPIs en personas y registros, sin salas ni canceladas, y período anterior = mismo tramo', async () => {
    const e = await withTenant(db as never, orgId, (tdb) => periodEngine(tdb, orgId, parseRange(FROM, TO)));
    expect(e.range).toEqual({ from: FROM, to: TO });
    expect(e.previousRange).toEqual(EXPECT.prevRange);
    expect(e.current.kpis).toMatchObject(EXPECT.cur);
    expect(e.previous.kpis).toMatchObject(EXPECT.prev);
    expect(e.deltas).toMatchObject({ people: 125, attendances: 200, activities: 100, uniqueVisitors: 50, occupancyPct: -4 });
    // activities[] del período: con registros, personas, aforo y ocupación por actividad.
    expect(e.current.activities.map((x) => [x.name, x.attendances, x.people, x.capacity, x.occupancyPct])).toEqual([
      ['Cine A', 4, 7, 100, 7], ['Taller B', 2, 2, 50, 4],
    ]);
    // nuevos vs recurrentes: Ana ya había venido en junio (recurrente); Beto y Carla son nuevos.
    expect(e.current.newVsReturning).toEqual({ nuevos: 2, recurrentes: 1 });
    expect(e.current.byType.map((t) => [t.type, t.attendances, t.people])).toEqual([['cine', 4, 7], ['taller', 2, 2]]);
    expect(e.current.byMonth.map((m) => [m.key, m.activities, m.attendances, m.people])).toEqual([['2026-07', 2, 6, 9]]);
    expect(e.current.daily.reduce((s, x) => s + x.people, 0)).toBe(9);
    expect(e.current.daily).toHaveLength(19);
    expect(e.previous.daily.reduce((s, x) => s + x.people, 0)).toBe(4);
    expect(e.current.byHour.reduce((s, x) => s + x.people, 0)).toBe(9);
    expect(e.current.byWeekday.reduce((s, x) => s + x.people, 0)).toBe(9);
    // topUsers: Ana primero (2 visitas), sin correo ni teléfono.
    expect(e.current.topUsers[0]).toMatchObject({ firstName: 'Ana', visitsInPeriod: 2 });
    expect(JSON.stringify(e)).not.toMatch(/@secreto|809-555/);
  });

  it('filtro por tipo recalcula todo con el mismo motor', async () => {
    const e = await withTenant(db as never, orgId, (tdb) => periodEngine(tdb, orgId, parseRange(FROM, TO), { types: ['cine'] }));
    expect(e.current.kpis).toMatchObject({ activities: 1, attendances: 4, people: 7, occupancyPct: 7 });
    expect(e.previous.kpis).toMatchObject({ activities: 1, people: 4 });
  });

  it('dashboard (period-summary JSON): personas y registros del motor', async () => {
    const j = (await get(`/reports/period-summary?from=${FROM}&to=${TO}`)).json();
    expect(j.kpis).toMatchObject(EXPECT.cur);
    expect(j.prev).toMatchObject(EXPECT.prev);
    expect(j.prevRange).toEqual(EXPECT.prevRange);
    expect(j.deltas).toMatchObject({ people: 125, attendances: 200, occupancyPct: -4 });
    expect(j.daily.reduce((s: number, x: { people: number }) => s + x.people, 0)).toBe(9);
    expect(j.byType[0]).toMatchObject({ type: 'cine', attendances: 4, people: 7 });
    expect(j.topActivities[0]).toMatchObject({ name: 'Cine A', attendances: 4, people: 7 });
  });

  it('XLSX de período: Resumen con las mismas cifras y comparación con el período anterior', async () => {
    const res = await get(`/reports/period.xlsx?from=${FROM}&to=${TO}`);
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as never);
    const ws = wb.getWorksheet('Resumen')!;
    // KPI: el valor está en la fila de abajo de la etiqueta.
    const kpi = (label: string): string => {
      let out = '';
      ws.eachRow((row, rn) => row.eachCell((c) => { if (!out && String(c.value) === label) out = String(ws.getCell(rn + 1, Number(c.col)).value); }));
      return out;
    };
    expect(kpi('Personas')).toBe(String(EXPECT.cur.people));
    expect(kpi('Registros')).toBe(String(EXPECT.cur.attendances));
    expect(kpi('Visitantes únicos')).toBe(String(EXPECT.cur.uniqueVisitors));
    expect(kpi('Ocupación (personas / aforo)')).toBe(`${EXPECT.cur.occupancyPct}%`);
    // Comparación: fila con la etiqueta y el valor anterior en la celda contigua.
    const cmp = (label: string): string[] => {
      let out: string[] = [];
      ws.eachRow((row) => { if (!out.length && String(row.getCell(2).value) === label) out = [String(row.getCell(3).value), String(row.getCell(4).value)]; });
      return out;
    };
    expect(cmp('Personas (anterior)')[0]).toBe(String(EXPECT.prev.people));
    expect(cmp('Registros (anterior)')[0]).toBe(String(EXPECT.prev.attendances));
    expect(cmp('Visitantes únicos (anterior)')[0]).toBe(String(EXPECT.prev.uniqueVisitors));
    expect(cmp('Ocupación (anterior)')).toEqual([`${EXPECT.prev.occupancyPct}%`, '-4 pp']);
    const all: string[] = [];
    wb.eachSheet((w) => w.eachRow((r) => r.eachCell((c) => { all.push(String(c.value)); })));
    expect(all.join('\n')).toContain('2026-06-01');
    expect(all.join('\n')).not.toMatch(/@secreto|809-555/);
    // Actividades: columnas de personas y registros.
    const acts = wb.getWorksheet('Actividades')!;
    const hdr = (acts.getRow(1).values as unknown[]).map(String);
    expect(hdr).toContain('Personas');
    expect(hdr).toContain('Registros');
  }, 30_000);

  it('HTML del PDF: mismas cifras (atributos data-kpi / data-prev)', async () => {
    const period = await withTenant(db as never, orgId, (tdb) => periodEngine(tdb, orgId, parseRange(FROM, TO)));
    const html = await buildPeriodPdfHtml({ organization, period });
    const val = (attr: string, k: string) => new RegExp(`data-${attr}="${k}"[^>]*>([^<]*)<`).exec(html)?.[1];
    expect(val('kpi', 'people')).toBe(String(EXPECT.cur.people));
    expect(val('kpi', 'attendances')).toBe(String(EXPECT.cur.attendances));
    expect(val('kpi', 'uniqueVisitors')).toBe(String(EXPECT.cur.uniqueVisitors));
    expect(val('kpi', 'occupancyPct')).toBe(`${EXPECT.cur.occupancyPct}%`);
    expect(val('prev', 'people')).toBe(String(EXPECT.prev.people));
    expect(val('prev', 'attendances')).toBe(String(EXPECT.prev.attendances));
    expect(val('prev', 'uniqueVisitors')).toBe(String(EXPECT.prev.uniqueVisitors));
    expect(val('prev', 'occupancyPct')).toBe(`${EXPECT.prev.occupancyPct}%`);
    expect(val('delta', 'occupancyPct')).toBe('-4 pp');
    expect(html).toContain('2026-06-01');
    expect(html).not.toMatch(/@secreto|809-555/);
  });

  it('Asistente: el texto da las mismas personas, registros, únicos, ocupación y período anterior', async () => {
    const r = await withTenant(db as never, orgId, (tdb) => runAgentQuery(tdb, orgId, 'reporte de este mes', TO));
    expect(r.kind).toBe('period_report');
    const m = r.message;
    expect(m).toContain(`${EXPECT.cur.people} personas`);
    expect(m).toContain(`${EXPECT.cur.attendances} registros`);
    expect(m).toContain(`${EXPECT.cur.uniqueVisitors} visitantes únicos`);
    expect(m).toContain(`${EXPECT.cur.occupancyPct}% de ocupación`);
    expect(m).toContain('1 al 19 de junio de 2026'); // fechas en prosa, no ISO (REP-U09)
    expect(m).toContain(`${EXPECT.prev.people} personas`);
    const k = (r as { period: { kpis: Record<string, number> } }).period.kpis;
    expect(k).toMatchObject(EXPECT.cur);
  });

  it('el endpoint /reports/period/preview ya no existe', async () => {
    expect((await get(`/reports/period/preview?from=${FROM}&to=${TO}`)).statusCode).toBe(404);
  });
});
