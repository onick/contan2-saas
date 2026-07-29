// apps/api-v2/test/reports.test.ts · integration (skip sin DATABASE_URL).
// F4 PR-1 · GET /reports/attendance-by-activity: agregación (check-ins +
// acompañantes + anónimos), roles (owner/admin sí, operator 403), 401/cross-tenant,
// aislamiento por tenant, filtro de rango, validación, CSV (BOM + Content-Disposition
// + sanitización anti-injection), auditoría sin PII.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

// Chromium local para el render del PDF (mismo criterio que reports-branded:
// mac dev usa el de Playwright; CI sin Chromium → skip honesto del test PDF).
const PLAYWRIGHT_CHROME = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? (existsSync(PLAYWRIGHT_CHROME) ? PLAYWRIGHT_CHROME : null);
if (CHROME) process.env.PUPPETEER_EXECUTABLE_PATH = CHROME;

run('GET /reports/attendance-by-activity', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `rep-a-${stamp}`;
  const slugB = `rep-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  const TOK = { owner: `rep-own-${stamp}`, admin: `rep-adm-${stamp}`, operator: `rep-ope-${stamp}`, b: `rep-b-${stamp}` };

  // Ventana del reporte
  const FROM = '2026-03-01';
  const TO = '2026-03-31';
  let actInRange: string; // 03-15, cap 100, 3 asistencias (1 normal, 1 con 2 niños, 1 anónima)
  let actMalicious: string; // 03-20, nombre con fórmula, 0 asistencias
  const MALICIOUS_NAME = '=cmd()|calc';

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'owner' | 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };
  const mkActivity = async (orgId: string, name: string, dateIso: string, capacity: number, category: string | null = null) =>
    (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name, type: 'concierto', location: 'Sala', date: dateIso, capacity, enrolled_count: 0, status: 'activa', category }).returning('id').executeTakeFirstOrThrow()).id;
  // user_id es obligatorio para asistencia NO anónima (check attendance_anonymous_consistent).
  const mkUser = async (orgId: string) => {
    const code = `TST-${randomUUID().slice(0, 6).toUpperCase()}`;
    const u = await db.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code, first_name: 'V', last_name: 'T', email: `${code.toLowerCase()}@rep.do`, phone: '809-0', visit_count: 1 }).returning('id').executeTakeFirstOrThrow();
    return { id: u.id, code };
  };
  const mkAttendance = async (orgId: string, activityId: string, opts: { anonymous?: boolean; companions?: number; userId?: string; userCode?: string } = {}) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, activity_id: activityId, activity_name: 'x',
      user_id: opts.anonymous ? null : (opts.userId ?? null),
      user_code: opts.anonymous ? null : (opts.userCode ?? null),
      anonymous: opts.anonymous ?? false, companions_children: opts.companions ?? 0,
      checked_in_at: new Date().toISOString(),
    }).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.owner, 'owner');
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');

    actInRange = await mkActivity(orgAId, 'Concierto Jazz', '2026-03-15T19:00:00.000Z', 100, 'Música');
    actMalicious = await mkActivity(orgAId, MALICIOUS_NAME, '2026-03-20T19:00:00.000Z', 10);
    await mkActivity(orgAId, 'Fuera de rango', '2026-01-10T19:00:00.000Z', 50); // NO debe aparecer
    await mkActivity(orgBId, 'Actividad B', '2026-03-15T19:00:00.000Z', 80); // tenant B, NO debe aparecer

    const uA1 = await mkUser(orgAId);
    const uA2 = await mkUser(orgAId);
    await mkAttendance(orgAId, actInRange, { userId: uA1.id, userCode: uA1.code }); // 1 persona
    await mkAttendance(orgAId, actInRange, { userId: uA2.id, userCode: uA2.code, companions: 2 }); // 3 personas
    await mkAttendance(orgAId, actInRange, { anonymous: true }); // 1 persona, anónima
    const uB = await mkUser(orgBId);
    await mkAttendance(orgBId, (await db.selectFrom('activities').select('id').where('organization_id', '=', orgBId).executeTakeFirstOrThrow()).id, { userId: uB.id, userCode: uB.code });

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
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const get = (qs: string, token?: string, host = hostA) =>
    app.inject({ method: 'GET', url: `/api/v2/reports/attendance-by-activity${qs}`, headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });

  it('admin → 200, agrega check-ins/personas/anónimos por actividad y filtra por rango', async () => {
    const res = await get(`?from=${FROM}&to=${TO}`, TOK.admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Sólo las 2 actividades del tenant A dentro del rango (orden por fecha desc)
    expect(body.rows.map((r: { name: string }) => r.name)).toEqual([MALICIOUS_NAME, 'Concierto Jazz']);
    const jazz = body.rows.find((r: { name: string }) => r.name === 'Concierto Jazz');
    expect(jazz).toMatchObject({ attendances: 3, people: 5, anonymous: 1, capacity: 100, occupancyPct: 5 });
    expect(body.totals).toMatchObject({ activities: 2, attendances: 3, people: 5, anonymous: 1, capacity: 110, occupancyPct: 5 });
    expect(body.period).toEqual({ from: FROM, to: TO });
  });

  it('categories → lista categorías del tenant con conteo (sin PII, tenant-scoped)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/reports/categories', headers: { host: hostA, cookie: `contan2_session=${TOK.admin}` } });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    // Sólo 'Música' (las otras actividades del tenant A tienen category null).
    expect(b.categories).toEqual([{ category: 'Música', activities: 1 }]);
    // sin sesión → 401; cross-tenant admin B en host A → 403.
    expect((await app.inject({ method: 'GET', url: '/api/v2/reports/categories', headers: { host: hostA } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v2/reports/categories', headers: { host: hostA, cookie: `contan2_session=${TOK.b}` } })).statusCode).toBe(403);
  });

  it('filtro category → acota a la categoría/ciclo y el nombre de archivo lo refleja', async () => {
    const res = await get(`?from=${FROM}&to=${TO}&category=${encodeURIComponent('Música')}`, TOK.admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(['Concierto Jazz']); // el malicioso (sin categoría) queda fuera
    expect(body.totals).toMatchObject({ activities: 1, attendances: 3, people: 5 });
    // categoría inexistente → 0 filas.
    expect((await get(`?from=${FROM}&to=${TO}&category=Inexistente`, TOK.admin)).json().rows).toEqual([]);
    // el nombre de archivo del csv refleja el ciclo.
    const csv = await get(`?from=${FROM}&to=${TO}&category=${encodeURIComponent('Música')}&format=csv`, TOK.admin);
    expect(String(csv.headers['content-disposition'])).toContain('filename="ciclo_M');
  });

  it('period-summary → KPIs + deltas + byType + daily + nuevos/recurrentes', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v2/reports/period-summary?from=${FROM}&to=${TO}`, headers: { host: hostA, cookie: `contan2_session=${TOK.admin}` } });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.kpis).toMatchObject({ activities: 2, attendances: 3, occupancyPct: 5 });
    expect(b.kpis.uniqueVisitors).toBeGreaterThanOrEqual(1);
    expect(b.byType[0]).toMatchObject({ type: 'concierto', attendances: 3, pct: 100 });
    expect(b.topActivities[0].name).toBe('Concierto Jazz');
    expect(b.daily.length).toBe(31); // 1..31 de marzo
    expect(b.newVsReturning.nuevos + b.newVsReturning.recurrentes).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(b.byHour) && Array.isArray(b.byWeekday)).toBe(true);
    expect(b.prevRange).toEqual({ from: '2026-01-29', to: '2026-02-28' }); // 31 días antes
    // sin sesión → 401
    expect((await app.inject({ method: 'GET', url: `/api/v2/reports/period-summary?from=${FROM}&to=${TO}`, headers: { host: hostA } })).statusCode).toBe(401);
  });

  it('owner también puede; operator → 403', async () => {
    expect((await get(`?from=${FROM}&to=${TO}`, TOK.owner)).statusCode).toBe(200);
    expect((await get(`?from=${FROM}&to=${TO}`, TOK.operator)).statusCode).toBe(403);
  });

  it('sin sesión → 401; cross-tenant (admin B en host A) → 403', async () => {
    expect((await get(`?from=${FROM}&to=${TO}`)).statusCode).toBe(401);
    expect((await get(`?from=${FROM}&to=${TO}`, TOK.b)).statusCode).toBe(403);
  });

  it('rango inválido → 400 (formato, from>to, demasiado amplio)', async () => {
    expect((await get(`?from=2026-13-40&to=${TO}`, TOK.admin)).statusCode).toBe(400);
    expect((await get(`?from=${TO}&to=${FROM}`, TOK.admin)).statusCode).toBe(400);
    expect((await get(`?from=2024-01-01&to=2026-12-31`, TOK.admin)).statusCode).toBe(400); // > 366 días
    expect((await get(`?from=${FROM}`, TOK.admin)).statusCode).toBe(400); // falta to
  });

  it('CSV: text/csv + Content-Disposition + BOM + celda maliciosa sanitizada', async () => {
    const res = await get(`?from=${FROM}&to=${TO}&format=csv`, TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(String(res.headers['content-disposition'])).toContain('attachment; filename="asistencia-por-actividad_2026-03-01_2026-03-31.csv"');
    const body = res.body;
    expect(body.startsWith('﻿')).toBe(true); // BOM
    expect(body).toContain('Actividad,Fecha,Lugar,Categoría,Estado,Capacidad,Inscritos,Check-ins,Personas,Anónimos,Ocupación %');
    expect(body).toContain(`'=cmd()|calc`); // nombre con fórmula → prefijado (no ejecuta)
    expect(body).not.toContain('\n=cmd()|calc'); // jamás una celda cruda que empiece con =
    expect(body).toContain('TOTAL');
  });

  it('xlsx: content-type + Content-Disposition + workbook branded + sin fórmulas', async () => {
    const res = await get(`?from=${FROM}&to=${TO}&format=xlsx`, TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('spreadsheetml');
    expect(String(res.headers['content-disposition'])).toContain('asistencia-por-actividad_2026-03-01_2026-03-31.xlsx"');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell(1, 1).value)).toContain('Asistencia por actividad'); // título branded
    let jazz = false;
    let maliciousIsText = true;
    ws.eachRow((row) => {
      const v0 = String(row.getCell(1).value ?? '');
      if (v0 === 'Concierto Jazz') jazz = true;
      if (v0 === MALICIOUS_NAME && row.getCell(1).type === ExcelJS.ValueType.Formula) maliciousIsText = false;
    });
    expect(jazz).toBe(true);
    expect(maliciousIsText).toBe(true); // el nombre con '=' es texto, NO fórmula
  });

  it.skipIf(!CHROME)('pdf: application/pdf branded (HTML→Chromium) + Content-Disposition + magic bytes', async () => {
    const res = await get(`?from=${FROM}&to=${TO}&format=pdf`, TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('application/pdf');
    expect(String(res.headers['content-disposition'])).toContain('asistencia-por-actividad_2026-03-01_2026-03-31.pdf"');
    const buf = res.rawPayload;
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-'); // PDF válido
  });

  it('formato inválido → 400', async () => {
    expect((await get(`?from=${FROM}&to=${TO}&format=foo`, TOK.admin)).statusCode).toBe(400);
  });

  it('variantes de mayúsculas/acentos/espacios = UNA categoría: se consolidan y el filtro matchea todas', async () => {
    // 3 actividades con la "misma" categoría escrita distinto (el caso real del
    // CCB: "Cine Clásico" / "cine clasico" / "cine clásico").
    const v1 = await mkActivity(orgAId, 'Tango 1', '2026-03-05T19:00:00.000Z', 50, 'Ciclo Tango');
    await mkActivity(orgAId, 'Tango 2', '2026-03-12T19:00:00.000Z', 50, 'ciclo  tango');
    await mkActivity(orgAId, 'Tango 3', '2026-03-19T19:00:00.000Z', 50, 'CICLO TANGO');
    const u = await mkUser(orgAId);
    await mkAttendance(orgAId, v1, { userId: u.id, userCode: u.code });

    // categories: una sola entrada consolidada con el conteo total.
    const cats = (await app.inject({ method: 'GET', url: '/api/v2/reports/categories', headers: { host: hostA, cookie: `contan2_session=${TOK.admin}` } })).json();
    const tango = cats.categories.filter((c: { category: string }) => c.category.toLowerCase().includes('tango'));
    expect(tango).toHaveLength(1);
    expect(tango[0]).toEqual({ category: 'Ciclo Tango', activities: 3 });

    // El filtro por categoría matchea las 3 variantes, escrito como sea.
    for (const q of ['Ciclo Tango', 'ciclo tango', 'CICLO   TANGO']) {
      const res = await get(`?from=${FROM}&to=${TO}&category=${encodeURIComponent(q)}`, TOK.admin);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.rows.map((r: { name: string }) => r.name).sort()).toEqual(['Tango 1', 'Tango 2', 'Tango 3']);
      expect(body.totals.activities).toBe(3);
    }
  });

  it('auditoría: una fila report.generated, actor enmascarado, sin PII', async () => {
    const before = Number((await db.selectFrom('tenant_audit_log').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).where('action', '=', 'report.generated').executeTakeFirstOrThrow()).n);
    await get(`?from=${FROM}&to=${TO}`, TOK.admin);
    const row = await db.selectFrom('tenant_audit_log').selectAll().where('organization_id', '=', orgAId).where('action', '=', 'report.generated').orderBy('id', 'desc').executeTakeFirstOrThrow();
    expect(row.actor_email_masked).toMatch(/^a\*\*\*@/);
    expect(row.actor_role).toBe('admin');
    expect(row.target_type).toBe('report');
    expect(row.target_id).toBe('attendance-by-activity');
    const metaStr = typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata ?? {});
    expect(metaStr).toContain('attendance-by-activity');
    expect(metaStr).not.toMatch(/@t\.local/); // sin email crudo
    expect(Number((await db.selectFrom('tenant_audit_log').select(db.fn.countAll<number>().as('n')).where('organization_id', '=', orgAId).where('action', '=', 'report.generated').executeTakeFirstOrThrow()).n)).toBe(before + 1);
  });
});
