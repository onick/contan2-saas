// apps/api-v2/test/monthly-register.test.ts · integration (skip sin DATABASE_URL).
// GET /reports/month.xlsx: registro mensual en el formato del departamento
// (8 columnas + Total + Resumen), asistencia = headcount real, tipo mapeado a
// las 5 etiquetas, salas permanentes/otros meses/otros tenants excluidos, roles.

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

run('GET /reports/month.xlsx', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `mreg-a-${stamp}`;
  const slugB = `mreg-b-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  let orgCId: string;
  const slugC = `mreg-c-${stamp}`;
  const hostC = `${slugC}.contan2.com`;
  const TOK = { admin: `mreg-adm-${stamp}`, operator: `mreg-ope-${stamp}`, b: `mreg-b-${stamp}`, c: `mreg-c-${stamp}` };

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (orgId: string, token: string, role: 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };
  const mkAct = async (orgId: string, name: string, dateIso: string, type: string, category: string | null, isPermanent = false) =>
    (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name, type, location: 'Sala', date: dateIso, capacity: 200, enrolled_count: 0, status: 'activa', category, is_permanent: isPermanent }).returning('id').executeTakeFirstOrThrow()).id;
  const mkUser = async (orgId: string) => {
    const code = `TST-${randomUUID().slice(0, 6).toUpperCase()}`;
    const u = await db.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code, first_name: 'V', last_name: 'T', email: `${code.toLowerCase()}@mreg.do`, phone: '809-0', visit_count: 1 }).returning('id').executeTakeFirstOrThrow();
    return { id: u.id, code };
  };
  const mkAtt = async (orgId: string, activityId: string, opts: { anonymous?: boolean; children?: number; adults?: number; userId?: string; userCode?: string } = {}) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, activity_id: activityId, activity_name: 'x',
      user_id: opts.anonymous ? null : (opts.userId ?? null), user_code: opts.anonymous ? null : (opts.userCode ?? null),
      anonymous: opts.anonymous ?? false, companions_children: opts.children ?? 0, companions_adults: opts.adults ?? 0,
      checked_in_at: new Date().toISOString(),
    }).execute();

  let actCine: string, actTeatro: string, actCharla: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = await mkOrg(slugA);
    orgBId = await mkOrg(slugB);
    await mkStaff(orgAId, TOK.admin, 'admin');
    await mkStaff(orgAId, TOK.operator, 'operator');
    await mkStaff(orgBId, TOK.b, 'admin');

    // Junio 2026 · tenant A: cine (día 16), teatro (día 9), conferencia→Charlas (día 23).
    actTeatro = await mkAct(orgAId, 'Obra Junio', '2026-06-09T19:00:00.000Z', 'teatro', 'Temporada de Teatro');
    actCine = await mkAct(orgAId, 'Peli Junio', '2026-06-16T19:00:00.000Z', 'cine', 'Ciclo de Cine Clásico');
    actCharla = await mkAct(orgAId, 'Charla Junio', '2026-06-23T19:00:00.000Z', 'conferencia', 'Actividades Especiales');
    // Excluidos: sala permanente, otro mes (mayo), otro tenant.
    await mkAct(orgAId, 'Sala VR', '2026-06-10T10:00:00.000Z', 'otro', null, true);
    await mkAct(orgAId, 'Peli Mayo', '2026-05-05T19:00:00.000Z', 'cine', 'Ciclo de Cine Clásico');
    await mkAct(orgBId, 'Ajeno', '2026-06-16T19:00:00.000Z', 'cine', 'X');

    // Cine: 1 identificado + 1 con 2 niños + 1 anónima = headcount 1 + 3 + 1 = 5.
    const u1 = await mkUser(orgAId); const u2 = await mkUser(orgAId);
    await mkAtt(orgAId, actCine, { userId: u1.id, userCode: u1.code });
    await mkAtt(orgAId, actCine, { userId: u2.id, userCode: u2.code, children: 2 });
    await mkAtt(orgAId, actCine, { anonymous: true });
    // Teatro: 1 con 1 adulto acompañante = headcount 2.
    const u3 = await mkUser(orgAId);
    await mkAtt(orgAId, actTeatro, { userId: u3.id, userCode: u3.code, adults: 1 });
    // Charla: sin asistencias = headcount 0.

    // Tenant C · casos de BORDE de zona horaria (America/Santo_Domingo = UTC-4):
    orgCId = await mkOrg(slugC);
    await mkStaff(orgCId, TOK.c, 'admin');
    // 30/jun 23:00 local = 01/jul 03:00 UTC → DEBE contar en JUNIO.
    await mkAct(orgCId, 'Borde fin de junio', '2026-07-01T03:00:00.000Z', 'cine', 'Ciclo de Cine Clásico');
    // 31/may 22:00 local = 01/jun 02:00 UTC → NO debe contar en junio (es mayo).
    await mkAct(orgCId, 'Borde fin de mayo', '2026-06-01T02:00:00.000Z', 'cine', 'Ciclo de Cine Clásico');

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId, orgCId]) {
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
    app.inject({ method: 'GET', url: `/api/v2/reports/month.xlsx${qs}`, headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });

  it('admin → xlsx branded con 8 columnas, filas ordenadas, tipo mapeado, headcount real y Total', async () => {
    const res = await get('?year=2026&month=6', TOK.admin);
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('spreadsheetml');
    expect(String(res.headers['content-disposition'])).toContain('registro_junio_2026.xlsx');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const ws = wb.worksheets[0];
    // Encabezado (fila 2).
    const header = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(ws.getCell(2, c).value ?? ''));
    expect(header).toEqual(['No.', 'Fecha', 'Mes', 'Semana', 'Tipo de actividad', 'Programa', 'Nombre Actividad / Observación', 'Asistencia']);

    // Filas 3..5 = teatro (09), cine (16), charla (23), ordenadas por fecha asc.
    expect(ws.getCell(3, 1).value).toBe(1);
    expect(String(ws.getCell(3, 5).value)).toBe('Teatro');
    expect(String(ws.getCell(3, 7).value)).toBe('Obra Junio');
    expect(ws.getCell(3, 8).value).toBe(2); // 1 + 1 adulto

    expect(String(ws.getCell(4, 5).value)).toBe('Cine');
    expect(ws.getCell(4, 8).value).toBe(5); // 1 + 3 + 1

    expect(ws.getCell(5, 1).value).toBe(3); // charla es la 3ra fila (No. 3)
  });

  it('conferencia se mapea a "Charlas" y la fila Total suma el headcount del mes', async () => {
    const res = await get('?year=2026&month=6', TOK.admin);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell(5, 5).value)).toBe('Charlas'); // conferencia → Charlas
    expect(ws.getCell(5, 8).value).toBe(0); // charla sin asistencias

    // Fila 6 = Total: con 7 (5 cine + 2 teatro + 0 charla).
    expect(String(ws.getCell(6, 7).value)).toBe('Total:');
    expect(ws.getCell(6, 8).value).toBe(7);

    // Sólo 3 actividades (permanente/otro mes/otro tenant excluidos).
    let dataRows = 0;
    ws.eachRow((row, n) => { if (n >= 3 && typeof row.getCell(1).value === 'number') dataRows++; });
    expect(dataRows).toBe(3);
  });

  it('mes vacío → xlsx con Total 0; validación de mes/año inválidos → 400', async () => {
    const res = await get('?year=2026&month=2', TOK.admin); // febrero sin datos
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell(3, 7).value)).toBe('Total:'); // sin filas de datos, Total en la 3
    expect(ws.getCell(3, 8).value).toBe(0);

    expect((await get('?year=2026&month=13', TOK.admin)).statusCode).toBe(400);
    expect((await get('?year=1999&month=6', TOK.admin)).statusCode).toBe(400);
    expect((await get('?year=abc&month=6', TOK.admin)).statusCode).toBe(400);
  });

  it('borde de zona horaria: el evento de las 22h del último día del mes cuenta en el mes correcto (TZ del tenant, no UTC)', async () => {
    const res = await get('?year=2026&month=6', TOK.c, hostC);
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const ws = wb.worksheets[0];
    // Junio de C debe tener EXACTAMENTE la actividad del 30/jun local (no la del 31/may).
    const names: string[] = [];
    ws.eachRow((row, n) => { if (n >= 3 && typeof row.getCell(1).value === 'number') names.push(String(row.getCell(7).value)); });
    expect(names).toEqual(['Borde fin de junio']);
    // La fecha mostrada es 30/06/2026 (día local), no 01/07.
    const fecha = ws.getCell(3, 2).value as Date;
    expect(fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha)).toBe('2026-06-30');
    // Y la del 31/may aparece en mayo, no en junio.
    const may = await get('?year=2026&month=5', TOK.c, hostC);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(may.rawPayload);
    const names2: string[] = [];
    wb2.worksheets[0].eachRow((row, n) => { if (n >= 3 && typeof row.getCell(1).value === 'number') names2.push(String(row.getCell(7).value)); });
    expect(names2).toEqual(['Borde fin de mayo']);
  });

  it('roles: operator → 403; sin sesión → 401; cross-tenant → 403', async () => {
    expect((await get('?year=2026&month=6', TOK.operator)).statusCode).toBe(403);
    expect((await get('?year=2026&month=6')).statusCode).toBe(401);
    expect((await get('?year=2026&month=6', TOK.b)).statusCode).toBe(403);
  });
});
