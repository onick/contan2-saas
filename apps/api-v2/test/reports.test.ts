// apps/api-v2/test/reports.test.ts · integration (skip sin DATABASE_URL).
// F4 PR-1 · GET /reports/attendance-by-activity: agregación (check-ins +
// acompañantes + anónimos), roles (owner/admin sí, operator 403), 401/cross-tenant,
// aislamiento por tenant, filtro de rango, validación, CSV (BOM + Content-Disposition
// + sanitización anti-injection), auditoría sin PII.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

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
