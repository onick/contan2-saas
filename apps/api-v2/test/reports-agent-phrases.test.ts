// apps/api-v2/test/reports-agent-phrases.test.ts · PR-R7 feat/reports-agent-v3.
// 1) Tabla de frases reales del equipo del CCB → intent esperado + parámetros
//    (parser puro, corre siempre). Incluye las de la auditoría (REP-A21) y la
//    crítica UX (REP-U09/U10).
// 2) Integración: las cifras del Asistente coinciden con periodEngine / consultas
//    de Puerta para el mismo rango y filtros; la prosa no trae ISO ni "matchee".

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.CHECKIN_TZ = 'America/Santo_Domingo';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { parseAgentQuery, runAgentQuery, type AgentIntent } from '../src/services/reports/agent.js';
import { parseRange } from '../src/services/report-data.js';
import { periodEngine } from '../src/services/reports/period-engine.js';
import { puertaKpis } from '../src/services/puerta-kpis.js';
import { formatRangeEs, formatDateEs, extractTypes, extractMetric } from '../src/services/reports/labels.js';

// Hoy = lunes 19 de octubre de 2026.
const TODAY = new Date('2026-10-19T12:00:00Z');
const TODAY_YMD = '2026-10-19';

type Case = [phrase: string, expected: Record<string, unknown>];
const OCT = { from: '2026-10-01', to: '2026-10-19' };

const CASES: Case[] = [
  // ── Métrica por período (REP-A21, REP-U10) ──
  ['asistencias de octubre', { kind: 'metric_query', metric: 'people', types: [], residual: '', period: OCT }],
  ['Personas este mes', { kind: 'metric_query', metric: 'people', period: OCT }],
  ['visitantes únicos de la semana pasada', { kind: 'metric_query', metric: 'uniqueVisitors', period: { from: '2026-10-12', to: '2026-10-18' } }],
  ['ocupación de septiembre', { kind: 'metric_query', metric: 'occupancyPct', period: { from: '2026-09-01', to: '2026-09-30' } }],
  ['visitantes de setiembre', { kind: 'metric_query', metric: 'people', period: { from: '2026-09-01', to: '2026-09-30' } }],
  ['¿Cuántas personas vinieron ayer?', { kind: 'metric_query', metric: 'people', period: { from: '2026-10-18', to: '2026-10-18' } }],
  ['personas hoy', { kind: 'metric_query', metric: 'people', period: { from: '2026-10-19', to: '2026-10-19' } }],
  ['asistencias del 1 al 15 de octubre', { kind: 'metric_query', metric: 'people', period: { from: '2026-10-01', to: '2026-10-15' } }],
  ['cuántos registros hubo en septiembre de 2025', { kind: 'metric_query', metric: 'attendances', period: { from: '2025-09-01', to: '2025-09-30' } }],
  ['¿Cuántas actividades hubo este año?', { kind: 'metric_query', metric: 'activities', period: { from: '2026-01-01', to: '2026-10-19' } }],
  ['asistencias', { kind: 'metric_query', metric: 'people', periodExplicit: false, period: OCT }],
  // ── Filtro por tipo ──
  ['asistencias de cine en octubre', { kind: 'metric_query', metric: 'people', types: ['cine'], residual: '', period: OCT }],
  ['talleres del mes pasado', { kind: 'metric_query', metric: 'people', types: ['taller'], period: { from: '2026-09-01', to: '2026-09-30' } }],
  ['conciertos de este mes', { kind: 'metric_query', types: ['concierto'], period: OCT }],
  ['ocupación del cine en el mes pasado', { kind: 'metric_query', metric: 'occupancyPct', types: ['cine'], period: { from: '2026-09-01', to: '2026-09-30' } }],
  ['asistencias de teatro entre el 3 y el 10 de octubre', { kind: 'metric_query', types: ['teatro'], period: { from: '2026-10-03', to: '2026-10-10' } }],
  // ── Métrica + período + resto de texto (ciclo o actividad; lo decide el ejecutor) ──
  ['asistencias de cine clásico en octubre', { kind: 'metric_query', metric: 'people', types: [], residual: 'cine clasico', period: OCT }],
  // ── Salas / Puerta ──
  ['visitas a la sala VR en octubre', { kind: 'sala_query', salaPhrase: 'vr', period: OCT }],
  ['cuánta gente pasó por Ada Balcácer esta semana', { kind: 'sala_query', salaPhrase: 'ada balcacer', period: { from: '2026-10-19', to: '2026-10-19' } }],
  ['cuánta gente visitó la sala de realidad virtual el mes pasado', { kind: 'sala_query', salaPhrase: 'realidad virtual', period: { from: '2026-09-01', to: '2026-09-30' } }],
  ['puerta esta semana', { kind: 'sala_query', salaPhrase: '', period: { from: '2026-10-19', to: '2026-10-19' } }],
  // ── Comparaciones ──
  ['compara octubre con septiembre', { kind: 'period_compare', a: OCT, b: { from: '2026-09-01', to: '2026-09-30' } }],
  ['este mes vs el anterior', { kind: 'period_compare', a: OCT, b: { from: '2026-09-01', to: '2026-09-19' } }],
  ['Compara este mes con el mes anterior', { kind: 'period_compare', a: OCT, b: { from: '2026-09-01', to: '2026-09-30' } }],
  ['compara esta semana con la semana pasada', { kind: 'period_compare', a: { from: '2026-10-19', to: '2026-10-19' }, b: { from: '2026-10-12', to: '2026-10-18' } }],
  ['cine vs teatro en el año', { kind: 'type_compare', types: ['cine', 'teatro'], period: { from: '2026-01-01', to: '2026-10-19' } }],
  ['compara cine con talleres en octubre', { kind: 'type_compare', types: ['cine', 'taller'], period: OCT }],
  // ── Reportes y actividades (siguen igual) ──
  ['Emite el reporte de este mes en PDF', { kind: 'period_report', format: 'pdf', period: OCT }],
  ['reporte del mes pasado en excel', { kind: 'period_report', format: 'xlsx', period: { from: '2026-09-01', to: '2026-09-30' } }],
  ['dame el reporte de julio', { kind: 'period_report', period: { from: '2026-07-01', to: '2026-07-31' } }],
  ['¿Cómo le fue a la Presentación del Catálogo?', { kind: 'activity_query', parts: ['presentacion catalogo'] }],
  ['compara Cine bajo las estrellas vs Concierto de Jazz', { kind: 'activity_query' }],
  ['reporte de cine clásico de marzo 2026', { kind: 'activity_query', parts: ['cine clasico'], period: { from: '2026-03-01', to: '2026-03-31' } }],
  ['¿Cómo le fue a Gente de Teatro?', { kind: 'activity_query', parts: ['gente teatro'] }],
  ['ayuda', { kind: 'help' }],
];

describe('agente de reportes v3 · tabla de frases reales', () => {
  it('tiene al menos 30 frases', () => expect(CASES.length).toBeGreaterThanOrEqual(30));

  for (const [phrase, expected] of CASES) {
    it(`«${phrase}»`, () => {
      const i = parseAgentQuery(phrase, TODAY) as AgentIntent;
      expect(i).toMatchObject(expected);
    });
  }

  it('tolera acentos, mayúsculas y signos (con y sin tilde da lo mismo)', () => {
    const a = parseAgentQuery('¿Cuántas PERSONAS vinieron en Octubre?', TODAY);
    const b = parseAgentQuery('cuantas personas vinieron en octubre', TODAY);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ kind: 'metric_query', metric: 'people', period: OCT });
  });

  it('prioridad: métrica+período gana sobre "nombre de actividad" (REP-U10)', () => {
    const i = parseAgentQuery('asistencias de octubre', TODAY);
    expect(i.kind).toBe('metric_query');
    // …pero "cómo le fue a" fuerza actividad aunque el nombre tenga palabras de métrica.
    expect(parseAgentQuery('cómo le fue a Asistencias al cine', TODAY).kind).toBe('activity_query');
  });

  it('un año sin mes y un mes del año pasado', () => {
    expect(parseAgentQuery('personas en 2025', TODAY)).toMatchObject({ period: { from: '2025-01-01', to: '2025-12-31' } });
    expect(parseAgentQuery('personas de diciembre', TODAY)).toMatchObject({ period: { from: '2025-12-01', to: '2025-12-31' } });
  });

  it('fechas explícitas inválidas no se inventan', () => {
    // 31 de septiembre no existe → no es un período; cae al flujo sin período.
    const i = parseAgentQuery('personas del 1 al 31 de septiembre', TODAY);
    expect(i.kind === 'metric_query' && i.period.to === '2026-09-31').toBe(false);
  });
});

describe('vocabulario único (labels.ts)', () => {
  it('fechas en prosa, nunca ISO', () => {
    expect(formatRangeEs('2026-10-01', '2026-10-19')).toBe('1 al 19 de octubre de 2026');
    expect(formatRangeEs('2026-10-19', '2026-10-19')).toBe('19 de octubre de 2026');
    expect(formatRangeEs('2026-09-01', '2026-10-19')).toBe('1 de septiembre al 19 de octubre de 2026');
    expect(formatRangeEs('2025-12-01', '2026-01-10')).toBe('1 de diciembre de 2025 al 10 de enero de 2026');
    expect(formatDateEs('2026-03-05')).toBe('5 de marzo de 2026');
  });
  it('extrae tipos y métricas con singular/plural', () => {
    expect(extractTypes('talleres y cine').types.sort()).toEqual(['cine', 'taller']);
    expect(extractTypes('visitas guiadas').types).toEqual(['visita_guiada']);
    expect(extractMetric('visitantes unicos y personas').metric).toBe('uniqueVisitors');
  });
});

// ── Integración: las cifras salen del mismo motor ──────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('agente de reportes v3 · cifras = periodEngine / Puerta (integración)', () => {
  let db: Kysely<Database>;
  const stamp = Date.now();
  let orgId: string;
  const ISO = /\d{4}-\d{2}-\d{2}/;

  const mkUser = async () => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: orgId, code: `P7-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'V', last_name: 'P7', email: `${id}@p7.test`, phone: null, visit_count: 1,
    } as never).execute();
    return id;
  };
  const mkAct = async (o: { name: string; type: string; date: string; capacity: number; permanent?: boolean }) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: orgId, name: o.name, type: o.type, location: 'Sala', date: o.date,
      capacity: o.capacity, enrolled_count: 0, status: o.permanent ? 'activa' : 'finalizada', description: '', image_url: null,
      is_permanent: o.permanent ?? false,
    } as never).execute();
    return id;
  };
  const att = async (act: string, o: { user?: string | null; children?: number; at: string; permanent?: boolean }) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, user_id: o.user ?? null, activity_id: act, activity_name: 'x',
      user_code: null, anonymous: !o.user, companions_children: o.children ?? 0, companions_adults: 0,
      registered_at: o.at, checked_in_at: o.at, is_permanent: o.permanent ?? false,
    } as never).execute();

  const ask = (q: string) => runAgentQuery(db, orgId, q, TODAY_YMD);
  const engine = (from: string, to: string, types?: string[]) => periodEngine(db, orgId, parseRange(from, to), types ? { types } : {});

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgId = (await db.insertInto('organizations').values({ slug: `p7-${stamp}`, name: 'Centro P7', status: 'active' } as never).returning('id').executeTakeFirstOrThrow()).id;
    const [u1, u2, u3, u4, u5, u6] = [await mkUser(), await mkUser(), await mkUser(), await mkUser(), await mkUser(), await mkUser()];
    // Octubre: cine (aforo 100) 2 registros / 4 personas · taller 1/1 · teatro 1/2.
    const cineOct = await mkAct({ name: 'Cine Aurora', type: 'cine', date: '2026-10-05T23:00:00Z', capacity: 100 });
    const tallerOct = await mkAct({ name: 'Taller Barro', type: 'taller', date: '2026-10-08T23:00:00Z', capacity: 20 });
    const teatroOct = await mkAct({ name: 'Teatro Sol', type: 'teatro', date: '2026-10-12T23:00:00Z', capacity: 40 });
    await att(cineOct, { user: u1, at: '2026-10-05T23:30:00Z' });
    await att(cineOct, { user: u2, children: 2, at: '2026-10-05T23:40:00Z' });
    await att(tallerOct, { user: u3, at: '2026-10-08T23:30:00Z' });
    await att(teatroOct, { user: u6, children: 1, at: '2026-10-12T23:30:00Z' });
    // Septiembre: cine 1/1 · teatro 2/2.
    const cineSep = await mkAct({ name: 'Cine Brisa', type: 'cine', date: '2026-09-10T23:00:00Z', capacity: 50 });
    const teatroSep = await mkAct({ name: 'Teatro Luna', type: 'teatro', date: '2026-09-12T23:00:00Z', capacity: 40 });
    await att(cineSep, { user: u1, at: '2026-09-10T23:30:00Z' });
    await att(teatroSep, { user: u4, at: '2026-09-12T23:30:00Z' });
    await att(teatroSep, { user: u5, at: '2026-09-12T23:40:00Z' });
    // Una actividad llamada igual que una palabra de métrica (año pasado): ambigüedad.
    await mkAct({ name: 'Registros', type: 'otro', date: '2025-01-10T23:00:00Z', capacity: 10 });
    // Salas permanentes: VR (aforo chico) y Ada Balcácer.
    const vr = await mkAct({ name: 'Sala VR', type: 'otro', date: '2026-01-01T12:00:00Z', capacity: 8, permanent: true });
    const ada = await mkAct({ name: 'Sala Ada Balcácer', type: 'otro', date: '2026-01-01T12:00:00Z', capacity: 30, permanent: true });
    await att(vr, { at: '2026-10-14T15:00:00Z', children: 4, permanent: true }); // 5 personas
    await att(vr, { user: u1, at: '2026-10-05T15:00:00Z', permanent: true }); // 1
    await att(vr, { at: '2026-09-03T15:00:00Z', permanent: true }); // período anterior: 1
    await att(ada, { at: '2026-10-15T15:00:00Z', children: 1, permanent: true }); // 2
  });

  afterAll(async () => {
    await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
    await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    await db.destroy();
  });

  it('"asistencias de octubre" = personas del periodEngine, registros entre paréntesis', async () => {
    const r = await ask('asistencias de octubre');
    const e = await engine('2026-10-01', '2026-10-19');
    expect(r.kind).toBe('metric_query');
    expect(r.metric).toMatchObject({ key: 'people', value: e.current.kpis.people, previousValue: e.previous.kpis.people });
  });

  it('desglose del fixture: personas y registros de octubre', async () => {
    const e = await engine('2026-10-01', '2026-10-19');
    expect(e.current.kpis).toMatchObject({ people: 7, attendances: 4, activities: 3 });
    const r = await ask('personas de octubre');
    expect(r.message).toContain('7 personas (4 registros)');
    expect(r.message).toContain('1 al 19 de octubre de 2026');
    expect(r.message).toContain(`Período anterior (${formatRangeEs(e.previousRange.from, e.previousRange.to)})`);
    expect(r.metric!.delta).toBe(e.deltas.people);
  });

  it('filtro por tipo: "asistencias de cine en octubre" = engine con types=[cine]', async () => {
    const r = await ask('asistencias de cine en octubre');
    const e = await engine('2026-10-01', '2026-10-19', ['cine']);
    expect(r.kind).toBe('metric_query');
    expect(r.metric).toMatchObject({ value: e.current.kpis.people, filterLabel: 'Cine', previousValue: e.previous.kpis.people });
    expect(r.metric!.value).toBe(4);
    expect(r.message).toContain('4 personas (2 registros)');
  });

  it('ocupación: el delta va en PUNTOS y coincide con el motor', async () => {
    const r = await ask('ocupación de octubre');
    const e = await engine('2026-10-01', '2026-10-19');
    expect(r.metric).toMatchObject({ key: 'occupancyPct', value: e.current.kpis.occupancyPct, deltaUnit: 'pts' });
    expect(r.metric!.delta).toBe(e.deltas.occupancyPct);
    expect(r.message).toMatch(/Variación: [+-]?\d+ puntos?\./);
  });

  it('rango explícito: "del 1 al 15 de octubre"', async () => {
    const r = await ask('asistencias del 1 al 15 de octubre');
    const e = await engine('2026-10-01', '2026-10-15');
    expect(r.metric!.value).toBe(e.current.kpis.people);
    expect(r.message).toContain('1 al 15 de octubre de 2026');
  });

  it('comparar períodos: valores y deltas del motor, calculados en paralelo', async () => {
    const r = await ask('compara octubre con septiembre');
    const [a, b] = [await engine('2026-10-01', '2026-10-19'), await engine('2026-09-01', '2026-09-30')];
    expect(r.kind).toBe('period_compare');
    expect(r.compare!.a.kpis.people).toBe(a.current.kpis.people);
    expect(r.compare!.b.kpis.people).toBe(b.current.kpis.people);
    expect(r.compare!.deltas.occupancyPct).toBe(a.current.kpis.occupancyPct - b.current.kpis.occupancyPct);
  });

  it('"este mes vs el anterior" compara contra el mismo tramo del mes anterior', async () => {
    const r = await ask('este mes vs el anterior');
    const b = await engine('2026-09-01', '2026-09-19');
    expect(r.kind).toBe('period_compare');
    expect(r.compare!.b.kpis.people).toBe(b.current.kpis.people);
  });

  it('cine vs teatro en el año = engine por tipo', async () => {
    const r = await ask('cine vs teatro en el año');
    const [c, t] = [await engine('2026-01-01', '2026-10-19', ['cine']), await engine('2026-01-01', '2026-10-19', ['teatro'])];
    expect(r.kind).toBe('type_compare');
    expect(r.compare!.a.kpis.people).toBe(c.current.kpis.people);
    expect(r.compare!.b.kpis.people).toBe(t.current.kpis.people);
    expect(r.compare!.a.label).toBe('Cine');
    expect(r.compare!.deltas.people).toBe(Math.round(((c.current.kpis.people - t.current.kpis.people) / t.current.kpis.people) * 100));
  });

  it('Puerta: "visitas a la sala VR en octubre" = consultas de Puerta, solo esa sala', async () => {
    const r = await ask('visitas a la sala VR en octubre');
    const vrId = (await db.selectFrom('activities').select('id').where('organization_id', '=', orgId).where('name', '=', 'Sala VR').executeTakeFirstOrThrow()).id;
    const k = await puertaKpis(db, orgId, [vrId], '2026-10-01', '2026-10-19');
    const p = await puertaKpis(db, orgId, [vrId], '2026-09-01', '2026-09-19');
    expect(r.kind).toBe('sala_query');
    expect(r.sala).toMatchObject({ scopeLabel: 'Sala VR', people: k.people, entries: k.entries });
    expect(r.sala!.previous).toMatchObject({ people: p.people, from: '2026-09-01', to: '2026-09-19' });
    expect(k.people).toBe(6);
    expect(r.message).toContain('6 personas (2 registros)');
  });

  it('Puerta: alias "realidad virtual" resuelve a la sala VR y "Ada Balcácer" a la suya', async () => {
    const vr = await ask('cuánta gente visitó la sala de realidad virtual en octubre');
    expect(vr.sala?.scopeLabel).toBe('Sala VR');
    const ada = await ask('cuánta gente pasó por Ada Balcácer en octubre');
    expect(ada.sala).toMatchObject({ scopeLabel: 'Sala Ada Balcácer', people: 2, entries: 1 });
  });

  it('Puerta: todas las salas suman personas y desglosan por sala', async () => {
    const r = await ask('puerta en octubre');
    expect(r.sala).toMatchObject({ scopeLabel: 'Todas las salas', people: 8, entries: 3 });
    expect(r.sala!.bySala.map((s) => s.name).sort()).toEqual(['Sala Ada Balcácer', 'Sala VR']);
  });

  it('sala inexistente → pregunta corta con las salas reales', async () => {
    const r = await ask('visitas a la sala Marte en octubre');
    expect(r.kind).toBe('clarify');
    expect(r.options!.length).toBeGreaterThanOrEqual(2);
  });

  it('REP-U09: sin "matchee" y sin fechas ISO en la prosa; nombre inexistente → 2 opciones', async () => {
    const qs = [
      'asistencias de octubre', 'compara octubre con septiembre', 'cine vs teatro en el año',
      'visitas a la sala VR en octubre', 'reporte de octubre', '¿cómo le fue a zzzz?',
      'asistencias de zzzz en octubre', 'personas esta semana',
    ];
    for (const q of qs) {
      const r = await ask(q);
      expect(r.message, q).not.toMatch(/matche/i);
      expect(r.message, q).not.toMatch(ISO);
    }
    const nf = await ask('asistencias de zzzz en octubre');
    expect(nf.kind).toBe('clarify');
    expect(nf.options).toHaveLength(2);
    expect(nf.message).toContain('No encontré ninguna actividad con «zzzz» en el nombre');
  });

  it('ambigüedad: palabra de métrica que es también el nombre de una actividad → pregunta con dos opciones', async () => {
    const r = await ask('registros de octubre');
    expect(r.kind).toBe('clarify');
    expect(r.options).toHaveLength(2);
    // Sin esa coincidencia exacta, la métrica gana.
    expect((await ask('personas de octubre')).kind).toBe('metric_query');
  });

  it('texto con actividad real: "asistencias de cine aurora en octubre" → estadísticas de la actividad', async () => {
    const r = await ask('asistencias de cine aurora en octubre');
    expect(r.kind).toBe('activity_stats');
    expect(r.activities![0]).toMatchObject({ name: 'Cine Aurora', people: 4, attendances: 2 });
    expect(r.message).toContain('5 de octubre de 2026');
  });

  it('período sin indicar: usa este mes y lo dice', async () => {
    const r = await ask('personas');
    expect(r.kind).toBe('metric_query');
    expect(r.message).toContain('tomé este mes');
  });

  it('rango raro no revienta (sin error 500)', async () => {
    const r = await ask('personas del 1 de enero de 2020 al 5 de enero de 2020');
    expect(['metric_query', 'clarify']).toContain(r.kind);
  });
});
