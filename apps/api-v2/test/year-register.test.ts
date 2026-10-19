// apps/api-v2/test/year-register.test.ts · integration (skip sin DATABASE_URL).
// GET /reports/year.xlsx: libro anual "Registro_Actividades_Culturales" (decisión P5):
// 12 hojas Ene–Dic + "Resumen Mensual" (meses × tipos, SUMIFS/SUM, TOTAL ANUAL) + "Listas"
// oculta; validaciones de datos C/D/E/F; Total con =SUM; fechas reales; la suma del
// libro = personas del PeriodEngine del año; RBAC de exportación.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, withTenant, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { periodEngine } from '../src/services/reports/period-engine.js';
import { parseRange } from '../src/services/report-data.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

type Role = 'admin' | 'puerta' | 'operator' | 'consulta' | 'protocolo' | 'biblioteca';
const ROLES: Role[] = ['admin', 'puerta', 'operator', 'consulta', 'protocolo', 'biblioteca'];

run('GET /reports/year.xlsx', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slugA = `yreg-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgId: string;
  let otherOrgId: string;
  const tok = (r: Role) => `yreg-${r}-${stamp}`;
  const TOK_B = `yreg-b-${stamp}`;

  const mkOrg = async (slug: string) =>
    (await db.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'TST' }).returning('id').executeTakeFirstOrThrow()).id;
  const mkStaff = async (org: string, token: string, role: Role) => {
    const s = await db.insertInto('staff_members').values({ organization_id: org, email: `${role}-${token}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
  };
  const mkAct = async (name: string, dateIso: string, type: string, category: string | null, extra: { permanent?: boolean; status?: string } = {}) =>
    (await db.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name, type, location: 'Sala', date: dateIso, capacity: 200, enrolled_count: 0, status: extra.status ?? 'activa', category, is_permanent: extra.permanent ?? false }).returning('id').executeTakeFirstOrThrow()).id;
  const mkAtt = async (activityId: string, opts: { children?: number; adults?: number; hold?: boolean } = {}) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, activity_id: activityId, activity_name: 'x', user_id: null, user_code: null,
      anonymous: true, companions_children: opts.children ?? 0, companions_adults: opts.adults ?? 0,
      checked_in_at: opts.hold ? null : new Date().toISOString(),
    }).execute();

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgId = await mkOrg(slugA);
    otherOrgId = await mkOrg(`yreg-b-${stamp}`);
    for (const r of ROLES) await mkStaff(orgId, tok(r), r);
    await mkStaff(otherOrgId, TOK_B, 'admin');

    // Enero: cine (3 personas = 1 + 2 niños).
    const cine = await mkAct('Peli Enero', '2026-01-15T19:00:00.000Z', 'cine', 'Ciclo de Cine Clásico');
    await mkAtt(cine, { children: 2 });
    // Marzo 30 (el 1.º cae domingo → Monday-start daría semana 6; el libro la pliega a 5): teatro, 2 personas.
    const teatro = await mkAct('Obra Marzo', '2026-03-30T19:00:00.000Z', 'teatro', 'Temporada de Teatro');
    await mkAtt(teatro, { adults: 1 });
    // Junio: charla (conferencia→Charlas) sin categoría → Programa "Actividades Especiales"; 1 persona + reserva sin check-in.
    const charla = await mkAct('Charla Junio', '2026-06-10T19:00:00.000Z', 'conferencia', null);
    await mkAtt(charla);
    await mkAtt(charla, { adults: 3, hold: true });
    // Diciembre 31 a las 23:00 local = 2027-01-01 03:00Z → cuenta en DICIEMBRE de 2026. Taller, 4 personas.
    const taller = await mkAct('Taller Fin de Año', '2027-01-01T03:00:00.000Z', 'taller', 'Programa Ad-hoc');
    await mkAtt(taller, { children: 1, adults: 2 });
    // Excluidos: sala permanente, cancelada con check-ins, otro año.
    const sala = await mkAct('Sala VR', '2026-06-11T10:00:00.000Z', 'otro', null, { permanent: true });
    await mkAtt(sala, { adults: 5 });
    const canc = await mkAct('Cancelada', '2026-02-02T19:00:00.000Z', 'cine', 'Ciclo de Cine Clásico', { status: 'cancelada' });
    await mkAtt(canc, { adults: 9 });
    const otroAnio = await mkAct('Peli 2025', '2025-12-30T19:00:00.000Z', 'cine', 'Ciclo de Cine Clásico');
    await mkAtt(otroAnio, { adults: 7 });

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgId, otherOrgId]) {
      if (!id) continue;
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in', db.selectFrom('staff_members').select('id').where('organization_id', '=', id)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
  });

  const get = (qs: string, token?: string, host = hostA, path = 'year.xlsx') =>
    app.inject({ method: 'GET', url: `/api/v2/reports/${path}${qs}`, headers: { host, ...(token ? { cookie: `contan2_session=${token}` } : {}) } });
  const load = async (res: { rawPayload: Buffer }) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(res.rawPayload); return wb; };
  const result = (v: unknown): number => Number((v as { result?: number }).result ?? 0);

  it('libro anual: 14 hojas (12 meses + Resumen Mensual + Listas oculta) y nombre de archivo oficial', async () => {
    const res = await get('?year=2026', tok('admin'));
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('spreadsheetml');
    expect(String(res.headers['content-disposition'])).toContain('Registro_Actividades_Culturales_2026.xlsx');
    const wb = await load(res);
    expect(wb.worksheets).toHaveLength(14);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Resumen Mensual', 'Listas',
    ]);
    expect(wb.getWorksheet('Listas')!.state).toBe('hidden');
    expect(wb.getWorksheet('Resumen Mensual')!.state).toBe('visible');
  });

  it('cada hoja: título, 8 columnas, autoFilter, Total con =SUM; mes vacío = encabezado y Total 0', async () => {
    const wb = await load(await get('?year=2026', tok('admin')));
    const ene = wb.getWorksheet('Ene')!;
    expect(String(ene.getCell(1, 1).value)).toBe('REGISTRO ACTIVIDADES ENERO 2026');
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(ene.getCell(2, c).value)))
      .toEqual(['No.', 'Fecha', 'Mes', 'Semana', 'Tipo de actividad', 'Programa', 'Nombre Actividad / Observación', 'Asistencia']);
    expect(ene.getCell(3, 7).value).toBe('Peli Enero');
    expect(ene.getCell(3, 8).value).toBe(3);
    expect(ene.getCell(4, 7).value).toBe('Total:');
    expect(ene.getCell(4, 8).value).toEqual({ formula: 'SUM(H3:H3)', result: 3 });
    expect(ene.autoFilter).toBe('A2:H3');
    // Encabezado en negrita.
    expect(ene.getCell(2, 1).font?.bold).toBe(true);

    const feb = wb.getWorksheet('Feb')!; // la cancelada de febrero NO cuenta
    expect(feb.getCell(3, 7).value).toBe('Total:');
    expect(result(feb.getCell(3, 8).value)).toBe(0);
    expect((feb.getCell(3, 8).value as { formula: string }).formula).toBe('SUM(H2:H2)');
    expect(feb.autoFilter).toBe('A2:H2');
  });

  it('fechas como Date real (día local), semana 1–5, Mes en palabras, Programa sin categoría = "Actividades Especiales"', async () => {
    const wb = await load(await get('?year=2026', tok('admin')));
    const mar = wb.getWorksheet('Mar')!;
    const f = mar.getCell(3, 2).value;
    expect(f instanceof Date).toBe(true);
    expect((f as Date).toISOString().slice(0, 10)).toBe('2026-03-30');
    expect(mar.getCell(3, 2).numFmt).toBe('dd/mm/yyyy');
    expect(mar.getCell(3, 3).value).toBe('Marzo');
    expect(mar.getCell(3, 4).value).toBe(5); // 30-mar con el 1.º en domingo: tope 5
    expect(mar.getCell(3, 5).value).toBe('Teatro');
    expect(mar.getCell(3, 6).value).toBe('Temporada de Teatro');
    const jun = wb.getWorksheet('Jun')!;
    expect(jun.getCell(3, 5).value).toBe('Charlas');
    expect(jun.getCell(3, 6).value).toBe('Actividades Especiales');
    expect(jun.getCell(3, 8).value).toBe(1); // la reserva con 3 adultos no suma
    // Borde: 31-dic 23:00 local cuenta en DICIEMBRE de 2026.
    const dic = wb.getWorksheet('Dic')!;
    expect(dic.getCell(3, 7).value).toBe('Taller Fin de Año');
    expect(((dic.getCell(3, 2).value) as Date).toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(dic.getCell(3, 8).value).toBe(4);
    for (const ws of wb.worksheets.slice(0, 12)) {
      ws.eachRow((row, n) => { if (n >= 3 && typeof row.getCell(4).value === 'number') expect(row.getCell(4).value as number).toBeLessThanOrEqual(5); });
    }
  });

  it('validaciones de datos en C/D/E/F apuntan a las listas ocultas, con el vocabulario completo', async () => {
    const wb = await load(await get('?year=2026', tok('admin')));
    const listas = wb.getWorksheet('Listas')!;
    const col = (c: number) => { const out: unknown[] = []; listas.getColumn(c).eachCell((x, n) => { if (n > 1 && x.value != null) out.push(x.value); }); return out; };
    expect(col(1)).toEqual(['Cine', 'Teatro', 'Talleres', 'Charlas', 'Actividades Especiales']);
    const progs = col(2).map(String);
    expect(progs).toEqual(expect.arrayContaining(['Ciclo de Cine Dominicano', 'Otras Obras de teatro', 'Proyecciones fuera de ciclo', 'Programa Ad-hoc']));
    expect(new Set(progs).size).toBe(progs.length);
    expect(col(3)).toEqual(['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']);
    expect(col(4)).toEqual([1, 2, 3, 4, 5]);
    for (const [name, r] of [['Ene', 3], ['Mar', 3], ['Jun', 3], ['Dic', 3]] as const) {
      const ws = wb.getWorksheet(name)!;
      expect(ws.getCell(r, 3).dataValidation.formulae, `${name} C`).toEqual(['Listas!$C$2:$C$13']);
      expect(ws.getCell(r, 4).dataValidation.formulae, `${name} D`).toEqual(['Listas!$D$2:$D$6']);
      expect(ws.getCell(r, 5).dataValidation.formulae, `${name} E`).toEqual(['Listas!$A$2:$A$6']);
      expect(ws.getCell(r, 6).dataValidation.formulae, `${name} F`).toEqual([`Listas!$B$2:$B$${progs.length + 1}`]);
      for (const c of [3, 4, 5, 6]) expect(ws.getCell(r, c).dataValidation.type).toBe('list');
    }
  });

  it('Resumen Mensual: meses × tipos con fórmulas, TOTAL ANUAL = suma de los totales mensuales = personas del PeriodEngine', async () => {
    const wb = await load(await get('?year=2026', tok('admin')));
    const rs = wb.getWorksheet('Resumen Mensual')!;
    expect([1, 2, 3, 4, 5, 6, 7].map((c) => String(rs.getCell(2, c).value)))
      .toEqual(['Mes', 'Cine', 'Teatro', 'Talleres', 'Charlas', 'Actividades Especiales', 'Total mensual']);
    expect([3, 4, 5, 14].map((r) => rs.getCell(r, 1).value)).toEqual(['Enero', 'Febrero', 'Marzo', 'Diciembre']);
    expect(rs.getCell(15, 1).value).toBe('TOTAL ANUAL');
    // Fórmulas: SUMIFS contra la hoja del mes; SUM por fila y por columna.
    expect((rs.getCell(3, 2).value as { formula: string }).formula).toBe("SUMIFS('Ene'!$H$3:$H$3,'Ene'!$E$3:$E$3,B$2)");
    expect((rs.getCell(3, 7).value as { formula: string }).formula).toBe('SUM(B3:F3)');
    expect((rs.getCell(15, 2).value as { formula: string }).formula).toBe('SUM(B3:B14)');
    expect((rs.getCell(15, 7).value as { formula: string }).formula).toBe('SUM(G3:G14)');

    // Celdas puntuales (valores en caché).
    expect(result(rs.getCell(3, 2).value)).toBe(3); // Ene · Cine
    expect(result(rs.getCell(5, 3).value)).toBe(2); // Mar · Teatro
    expect(result(rs.getCell(8, 5).value)).toBe(1); // Jun · Charlas
    expect(result(rs.getCell(14, 4).value)).toBe(4); // Dic · Talleres

    // Suma del pivote = suma de los Totales mensuales de las 12 hojas = personas del PeriodEngine del año.
    const monthlyTotals = wb.worksheets.slice(0, 12).map((ws) => {
      let t = 0; ws.eachRow((row) => { if (row.getCell(7).value === 'Total:') t = result(row.getCell(8).value); });
      return t;
    });
    const sheetsSum = monthlyTotals.reduce((a, b) => a + b, 0);
    const pivotSum = Array.from({ length: 12 }, (_, i) => result(rs.getCell(3 + i, 7).value)).reduce((a, b) => a + b, 0);
    const annual = result(rs.getCell(15, 7).value);
    const engine = await withTenant(db as never, orgId, (tdb) => periodEngine(tdb, orgId, parseRange('2026-01-01', '2026-12-31')));
    expect(engine.current.kpis.people).toBe(10); // 3 + 2 + 1 + 4
    expect(sheetsSum).toBe(engine.current.kpis.people);
    expect(pivotSum).toBe(engine.current.kpis.people);
    expect(annual).toBe(engine.current.kpis.people);
    expect(Array.from({ length: 5 }, (_, i) => result(rs.getCell(15, 2 + i).value))).toEqual([3, 2, 4, 1, 0]);
  });

  it('el mensual reutiliza el constructor: hoja del mes + Resumen (1 mes) + Listas, nombre _AAAA_MM', async () => {
    const res = await get('?year=2026&month=3', tok('admin'), hostA, 'month.xlsx');
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-disposition'])).toContain('Registro_Actividades_Culturales_2026_03.xlsx');
    const wb = await load(res);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Mar', 'Resumen Mensual', 'Listas']);
    expect(wb.getWorksheet('Mar')!.getCell(3, 7).value).toBe('Obra Marzo');
  });

  it('año inválido → 400; año sin datos → libro de 14 hojas con ceros', async () => {
    expect((await get('?year=abc', tok('admin'))).statusCode).toBe(400);
    expect((await get('?year=1999', tok('admin'))).statusCode).toBe(400);
    const res = await get('?year=2030', tok('admin'));
    expect(res.statusCode).toBe(200);
    const wb = await load(res);
    expect(wb.worksheets).toHaveLength(14);
    expect(result(wb.getWorksheet('Resumen Mensual')!.getCell(15, 7).value)).toBe(0);
  });

  it('RBAC: admin y puerta descargan; operator/consulta/protocolo/biblioteca → 403; sin sesión → 401; cross-tenant → 403', async () => {
    expect((await get('?year=2026', tok('admin'))).statusCode).toBe(200);
    expect((await get('?year=2026', tok('puerta'))).statusCode).toBe(200);
    for (const r of ['operator', 'consulta', 'protocolo', 'biblioteca'] as const) {
      expect((await get('?year=2026', tok(r))).statusCode, r).toBe(403);
    }
    expect((await get('?year=2026')).statusCode).toBe(401);
    expect((await get('?year=2026', TOK_B)).statusCode).toBe(403);
  });
});
