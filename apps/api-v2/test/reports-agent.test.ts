// apps/api-v2/test/reports-agent.test.ts · Asistente de Reportes.
// Parser de intenciones (puro, corre siempre) + integración del endpoint
// POST /reports/agent (PG efímero; skip sin DATABASE_URL).

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { parseAgentQuery, resolvePeriod } from '../src/services/reports/agent.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

// ── Parser (puro) ───────────────────────────────────────────────────────────
describe('agente de reportes · parser de intenciones', () => {
  const today = new Date('2026-08-06T12:00:00Z');

  it('ayuda y saludos → help', () => {
    expect(parseAgentQuery('ayuda', today).kind).toBe('help');
    expect(parseAgentQuery('¿qué puedes hacer?', today).kind).toBe('help');
  });

  it('períodos en español: este mes / mes pasado / mes con y sin año / últimos N días', () => {
    expect(resolvePeriod('este mes', today)).toMatchObject({ from: '2026-08-01', to: '2026-08-06' });
    expect(resolvePeriod('mes pasado', today)).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
    expect(resolvePeriod('julio', today)).toMatchObject({ from: '2026-07-01', to: '2026-07-31' });
    expect(resolvePeriod('julio 2025', today)).toMatchObject({ from: '2025-07-01', to: '2025-07-31' });
    // Mes futuro sin año → la ocurrencia más reciente (año anterior).
    expect(resolvePeriod('diciembre', today)).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(resolvePeriod('últimos 30 días', today)).toMatchObject({ from: '2026-07-08', to: '2026-08-06' });
  });

  it('emitir reporte: intent period_report con formato', () => {
    const i = parseAgentQuery('Emite el reporte de este mes en PDF', today);
    expect(i).toMatchObject({ kind: 'period_report', format: 'pdf' });
    const i2 = parseAgentQuery('reporte del mes pasado en excel', today);
    expect(i2).toMatchObject({ kind: 'period_report', format: 'xlsx' });
  });

  it('comparar períodos: "compara julio con junio" y "este mes vs mes anterior"', () => {
    const i = parseAgentQuery('Compara julio con junio', today);
    expect(i.kind).toBe('period_compare');
    if (i.kind === 'period_compare') {
      expect(i.a.from).toBe('2026-07-01');
      expect(i.b.from).toBe('2026-06-01');
    }
    expect(parseAgentQuery('este mes vs mes anterior', today).kind).toBe('period_compare');
    // "compara este mes" solo → contra el período anterior de igual duración.
    const solo = parseAgentQuery('compara este mes', today);
    expect(solo.kind).toBe('period_compare');
    if (solo.kind === 'period_compare') expect(solo.b.to) .toBe('2026-07-31');
  });

  it('comparar actividades: nombres que no son períodos → activity_query con 2 partes', () => {
    const i = parseAgentQuery('Compara Cine bajo las estrellas vs Concierto de Jazz', today);
    expect(i.kind).toBe('activity_query');
    if (i.kind === 'activity_query') expect(i.parts).toHaveLength(2);
  });

  it('consulta de actividad: "cómo le fue a X" → activity_query de 1 parte', () => {
    const i = parseAgentQuery('¿Cómo le fue a la Presentación del Catálogo?', today);
    expect(i.kind).toBe('activity_query');
    if (i.kind === 'activity_query') {
      expect(i.parts).toHaveLength(1);
      expect(i.parts[0]).toContain('presentacion');
    }
  });

  it('nombre + período en la misma frase → activity_query CON período', () => {
    const i = parseAgentQuery('reporte de cine clasico de marzo 2026', today);
    expect(i.kind).toBe('activity_query');
    if (i.kind === 'activity_query') {
      expect(i.parts[0]).toBe('cine clasico');
      expect(i.period).toMatchObject({ from: '2026-03-01', to: '2026-03-31' });
    }
    // Solo el período (sin nombre) sigue siendo period_report.
    expect(parseAgentQuery('dame el reporte completo de marzo 2026', today).kind).toBe('period_report');
  });
});

// ── Endpoint (integración) ──────────────────────────────────────────────────
run('POST /reports/agent · integración', () => {
  let db: Kysely<Database>; let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `agt-${stamp}`; const host = `${slug}.contan2.com`;
  const tok = `agt-tok-${stamp}`;
  let orgId: string;

  const post = (query: string, withCookie = true) => app.inject({
    method: 'POST', url: '/api/v2/reports/agent',
    headers: { host, 'content-type': 'application/json', ...(withCookie ? { cookie: `contan2_session=${tok}` } : {}) },
    payload: { query },
  });

  const mkActivity = async (name: string, dateIso: string, capacity: number, category: string | null = null) =>
    (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name, type: 'concierto', location: 'Sala', date: dateIso, capacity, enrolled_count: 0, status: 'finalizada', category }).returning('id').executeTakeFirstOrThrow()).id;
  const mkUser = async () => {
    const code = `AGT-${randomUUID().slice(0, 6).toUpperCase()}`;
    return (await db.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code, first_name: 'V', last_name: 'T', email: `${code.toLowerCase()}@agt.do`, phone: null, visit_count: 1 }).returning('id').executeTakeFirstOrThrow()).id;
  };
  const mkAtt = async (activityId: string, userId: string, companions = 0) =>
    db.insertInto('attendance').values({ id: randomUUID(), organization_id: orgId, activity_id: activityId, activity_name: 'x', user_id: userId, anonymous: false, companions_children: companions, checked_in_at: new Date().toISOString() }).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    orgId = (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'AGT' }).returning('id').executeTakeFirstOrThrow()).id;
    const staff = await db.insertInto('staff_members').values({ organization_id: orgId, email: `agt-${stamp}@t.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: staff.id, token_hash: hashToken(tok), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();

    // Marzo: 2 actividades (una con asistencia + acompañantes) · Febrero: 1.
    const estrella = await mkActivity('Concierto Estrella', '2026-03-10T19:00:00.000Z', 100);
    await mkActivity('Taller Estrella', '2026-03-12T19:00:00.000Z', 30);
    const luna = await mkActivity('Concierto Luna', '2026-02-05T19:00:00.000Z', 80);
    // Ciclos: dos funciones de Bolero Viejo (una variante de mayúsculas) + una de Rock Andino.
    const b1 = await mkActivity('Bolero | Noche 1', '2026-05-10T19:00:00.000Z', 50, 'Bolero Viejo');
    const b2 = await mkActivity('Bolero | Noche 2', '2026-05-17T19:00:00.000Z', 50, 'bolero  viejo');
    const r1 = await mkActivity('Rock | Único', '2026-05-20T19:00:00.000Z', 100, 'Rock Andino');
    const u1 = await mkUser(); const u2 = await mkUser(); const u3 = await mkUser();
    const u4 = await mkUser(); const u5 = await mkUser(); const u6 = await mkUser();
    await mkAtt(estrella, u1); await mkAtt(estrella, u2, 2); // 2 check-ins · 4 personas
    await mkAtt(luna, u3);
    await mkAtt(b1, u4, 1); await mkAtt(b2, u5); // Bolero Viejo: 2 check-ins · 3 personas
    await mkAtt(r1, u6); // Rock Andino: 1 check-in · 1 persona

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

  it('401 sin cookie · 400 consulta inválida', async () => {
    expect((await post('reporte de marzo', false)).statusCode).toBe(401);
    expect((await post('x')).statusCode).toBe(400);
  });

  it('reporte de un mes: KPIs + links (período pdf/xlsx + registro mensual)', async () => {
    const res = await post('Emite el reporte de marzo 2026');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.kind).toBe('period_report');
    expect(b.period.kpis.activities).toBe(2);
    expect(b.period.kpis.attendances).toBe(2);
    const types = b.links.map((l: { type: string }) => l.type);
    expect(types).toContain('period');
    expect(types).toContain('month');
    const month = b.links.find((l: { type: string }) => l.type === 'month');
    expect(month.params).toEqual({ year: '2026', month: '3' });
  });

  it('comparar períodos: marzo vs febrero con deltas', async () => {
    const res = await post('compara marzo 2026 con febrero 2026');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.kind).toBe('period_compare');
    expect(b.compare.a.kpis.activities).toBe(2);
    expect(b.compare.b.kpis.activities).toBe(1);
    expect(b.compare.deltas.activities).toBe(100); // 2 vs 1
  });

  it('stats de actividad: check-ins reales + personas con acompañantes', async () => {
    const res = await post('¿cómo le fue a concierto estrella?');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.kind).toBe('activity_stats');
    expect(b.activities[0]).toMatchObject({ name: 'Concierto Estrella', attendances: 2, people: 4 });
    expect(b.links.some((l: { type: string }) => l.type === 'activity')).toBe(true);
  });

  it('ambigüedad → clarify con opciones', async () => {
    const res = await post('cómo le fue a estrella');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.kind).toBe('clarify');
    expect(b.options.length).toBeGreaterThanOrEqual(2);
  });

  it('comparar actividades por nombre', async () => {
    const res = await post('compara concierto estrella vs concierto luna');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.kind).toBe('activity_compare');
    expect(b.activities.map((a: { name: string }) => a.name)).toEqual(['Concierto Estrella', 'Concierto Luna']);
  });

  it('reporte por categoría/ciclo: consolida variantes y trae links de descarga', async () => {
    const res = await post('Dame el reporte completo de bolero viejo');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.kind).toBe('category_report');
    // Las 2 variantes ("Bolero Viejo" + "bolero  viejo") cuentan juntas.
    expect(b.categories[0]).toMatchObject({ category: 'Bolero Viejo', activities: 2, attendances: 2, people: 3 });
    const link = b.links.find((l: { type: string }) => l.type === 'attendance');
    expect(link.params.category).toBe('Bolero Viejo');
  });

  it('reporte por categoría con período explícito', async () => {
    const res = await post('reporte de bolero viejo de mayo 2026');
    const b = res.json();
    expect(b.kind).toBe('category_report');
    expect(b.categories[0].from).toBe('2026-05-01');
    expect(b.categories[0].people).toBe(3);
  });

  it('comparar ciclos: "compara X vs Y" y también "X y Y"', async () => {
    const r1 = (await post('compara bolero viejo vs rock andino')).json();
    expect(r1.kind).toBe('category_compare');
    expect(r1.categories.map((c: { category: string }) => c.category)).toEqual(['Bolero Viejo', 'Rock Andino']);
    expect(r1.categories[0].people).toBe(3);
    expect(r1.categories[1].people).toBe(1);
    // "dame el reporte de bolero viejo y rock andino" (sin "compara").
    const r2 = (await post('dame el reporte de bolero viejo y rock andino')).json();
    expect(r2.kind).toBe('category_compare');
  });

  it('ayuda → opciones sugeridas', async () => {
    const b = (await post('ayuda')).json();
    expect(b.kind).toBe('help');
    expect(b.options.length).toBeGreaterThan(2);
  });
});
