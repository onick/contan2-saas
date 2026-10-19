// apps/api-v2/test/reports-scope.test.ts · PR-R1 fix/reports-scope-and-dates.
// REP-A01 (salas permanentes fuera del motor), REP-A02 (canceladas fuera),
// REP-A04 (fechas en hora de RD), REP-A05 (Excel de protocolo), REP-A07/A26
// (tope y validación de rango), P4 (mismo tramo del mes anterior).

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';
process.env.CHECKIN_TZ = 'America/Santo_Domingo';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { parseRange } from '../src/services/report-data.js';
import { previousPeriodYmd } from '../src/services/reports/range.js';
import { excelDateCell } from '../src/services/reports/fmt.js';

describe('rango · parseRange (A07/A26)', () => {
  it('rechaza fechas imposibles (2026-02-31)', () => {
    expect(() => parseRange('2026-02-31', '2026-03-02')).toThrow(/no válidas|inválid/i);
    expect(() => parseRange('2026-03-01', '2026-04-31')).toThrow(/no válidas|inválid/i);
  });
  it('rechaza from > to y rango > 366 días', () => {
    expect(() => parseRange('2026-10-02', '2026-10-01')).toThrow(/anterior/);
    expect(() => parseRange('2000-01-01', '2099-12-31')).toThrow(/366/);
  });
  it('acepta bisiesto válido', () => {
    expect(parseRange('2028-02-29', '2028-02-29').from).toBe('2028-02-29');
  });
});

describe('P4 · período anterior de un mes', () => {
  it('mes hasta hoy (1..19 oct) -> 1..19 sep', () => {
    expect(previousPeriodYmd('2026-10-01', '2026-10-19')).toEqual({ from: '2026-09-01', to: '2026-09-19' });
  });
  it('tramo mayor que el mes anterior se recorta al fin de ese mes', () => {
    expect(previousPeriodYmd('2026-03-01', '2026-03-30')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('mes completo -> mes anterior completo (aunque tenga distinto largo)', () => {
    expect(previousPeriodYmd('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousPeriodYmd('2026-02-01', '2026-02-28')).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(previousPeriodYmd('2026-01-01', '2026-01-31')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('rangos arbitrarios mantienen los N días previos', () => {
    expect(previousPeriodYmd('2026-03-10', '2026-03-19')).toEqual({ from: '2026-02-28', to: '2026-03-09' });
  });
});

describe('excelDateCell', () => {
  it('22:00 DR (02:00Z del día siguiente) -> medianoche UTC del día DR', () => {
    expect(excelDateCell('2026-05-15T02:00:00Z')).toEqual(new Date('2026-05-14T00:00:00Z'));
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('reportes · alcance y fechas (integración)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const host = `repsc-${stamp}.contan2.com`;
  const TOK = `repsc-admin-${stamp}`;
  let orgId: string;
  let ip = 0;
  const get = (url: string) => app.inject({
    method: 'GET', url,
    headers: { host, 'x-forwarded-for': `10.9.0.${(ip++ % 250) + 1}`, cookie: `contan2_session=${TOK}` },
  });

  const mkAct = async (o: { name: string; date: string; capacity: number; status?: string; permanent?: boolean }) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: orgId, name: o.name, type: 'cine', location: 'Sala', date: o.date,
      capacity: o.capacity, enrolled_count: 0, status: o.status ?? 'finalizada', description: '', image_url: null,
      category: null, is_permanent: o.permanent ?? false,
    } as never).execute();
    return id;
  };
  const attend = async (act: string, at: string, n = 1) => {
    for (let i = 0; i < n; i++) {
      await db.insertInto('attendance').values({
        id: randomUUID(), organization_id: orgId, user_id: null, activity_id: act, activity_name: 'x',
        user_code: null, anonymous: true, companions_children: 0, registered_at: at, checked_in_at: at,
      } as never).execute();
    }
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    orgId = (await db.insertInto('organizations').values({ slug: `repsc-${stamp}`, name: 'Centro Scope', status: 'active' } as never)
      .returning('id').executeTakeFirstOrThrow()).id;
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `admin-sc-${stamp}@test.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(TOK), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
    // Julio 2026: una función real (aforo 100, 20 personas), 22:00 DR del 14-jul (= 02:00Z del 15).
    const real = await mkAct({ name: 'Funcion Real', date: '2026-07-15T02:00:00Z', capacity: 100 });
    await attend(real, '2026-07-15T02:10:00Z', 20);
    // Sala permanente creada en julio con aforo 100000 y visitas en julio y agosto.
    const sala = await mkAct({ name: 'Sala Ada', date: '2026-07-08T14:00:00Z', capacity: 100000, status: 'activa', permanent: true });
    await attend(sala, '2026-07-09T15:00:00Z', 5);
    await attend(sala, '2026-08-20T15:00:00Z', 7);
    // Actividad cancelada con check-ins previos.
    const canc = await mkAct({ name: 'Funcion Cancelada', date: '2026-07-20T16:00:00Z', capacity: 50, status: 'cancelada' });
    await attend(canc, '2026-07-20T16:05:00Z', 3);
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) {
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
        db.selectFrom('staff_members').select('id').where('organization_id', '=', orgId)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  it('period-summary excluye sala permanente y cancelada', async () => {
    const j = (await get('/api/v2/reports/period-summary?from=2026-07-01&to=2026-07-31')).json();
    expect(j.kpis.activities).toBe(1);
    expect(j.kpis.attendances).toBe(20);
    expect(j.kpis.occupancyPct).toBe(20);
    expect(j.byType.reduce((n: number, t: { attendances: number }) => n + t.attendances, 0)).toBe(20);
    expect(j.byHour.reduce((n: number, h: { count: number }) => n + h.count, 0)).toBe(20);
  });

  it('preview de período excluye salas y canceladas', async () => {
    const j = (await get('/api/v2/reports/period/preview?from=2026-07-01&to=2026-07-31')).json();
    expect(j.summary.activitiesCount).toBe(1);
    expect(j.summary.attendancesCount).toBe(20);
    expect(j.summary.avgOccupancy).toBe(20);
    expect(j.topActivities.map((a: { name: string }) => a.name)).toEqual(['Funcion Real']);
  });

  it('attendance-by-activity (JSON) excluye salas y canceladas; ocupación intacta', async () => {
    const j = (await get('/api/v2/reports/attendance-by-activity?from=2026-07-01&to=2026-07-31&format=json')).json();
    expect(j.totals).toMatchObject({ activities: 1, capacity: 100, people: 20, occupancyPct: 20 });
  });

  it('CSV: la función de las 22:00 DR del 14-jul sale con fecha 2026-07-14', async () => {
    const res = await get('/api/v2/reports/attendance-by-activity?from=2026-07-01&to=2026-07-31&format=csv');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Funcion Real,2026-07-14,');
    expect(res.body).not.toContain('2026-07-15');
    expect(res.body).not.toContain('Sala Ada');
  });

  it('XLSX de asistencia: Fecha como celda Date del día DR', async () => {
    const res = await get('/api/v2/reports/attendance-by-activity?from=2026-07-01&to=2026-07-31&format=xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const ws = wb.worksheets[0]!;
    let found: unknown;
    ws.eachRow((row) => { if (row.getCell(1).value === 'Funcion Real') found = row.getCell(2).value; });
    expect(found).toBeInstanceOf(Date);
    expect((found as Date).toISOString().slice(0, 10)).toBe('2026-07-14');
  });

  it('PDF de asistencia: el HTML agrupa por día DR', async () => {
    const { buildAttendancePdfHtml } = await import('../src/services/reports/attendance-pdf-template.js');
    const html = await buildAttendancePdfHtml({
      organization: { name: 'C', slug: 'c', primaryColor: null, secondaryColor: null, logoUrl: null, credentialLogoUrl: null },
      report: {
        period: { from: '2026-07-01', to: '2026-07-31' },
        totals: { activities: 1, attendances: 1, people: 1, anonymous: 0, capacity: 10, occupancyPct: 10, reserved: 0 },
        rows: [{ activityId: 'a', name: 'Noche', date: '2026-07-15T02:00:00.000Z', location: 'S', category: null, status: 'finalizada', capacity: 10, enrolledCount: 0, attendances: 1, people: 1, anonymous: 0, occupancyPct: 10, reserved: 0 }],
      },
      category: null,
    });
    expect(html).toMatch(/\b14 jul/i);
    expect(html).not.toMatch(/\b15 jul/i);
  });

  it('registro mensual excluye canceladas y salas', async () => {
    const res = await get('/api/v2/reports/month.xlsx?year=2026&month=7');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const names: string[] = [];
    wb.worksheets[0]!.eachRow((row) => names.push(String(row.getCell(7).value ?? '')));
    expect(names).toContain('Funcion Real');
    expect(names).not.toContain('Funcion Cancelada');
    expect(names).not.toContain('Sala Ada');
  });

  it('period.pdf/xlsx/preview: 400 con rango enorme, fecha imposible y from>to', async () => {
    for (const path of ['period.pdf', 'period.xlsx', 'period/preview']) {
      const a = await get(`/api/v2/reports/${path}?from=2000-01-01&to=2099-12-31`);
      expect(a.statusCode).toBe(400);
      expect(a.json().error).toMatch(/366/);
      const b = await get(`/api/v2/reports/${path}?from=2026-02-31&to=2026-03-02`);
      expect(b.statusCode).toBe(400);
      const c = await get(`/api/v2/reports/${path}?from=2026-10-02&to=2026-10-01`);
      expect(c.statusCode).toBe(400);
    }
  });

  it('comparación de mes parcial contra el mismo tramo del mes anterior (P4)', async () => {
    const j = (await get('/api/v2/reports/period/preview?from=2026-07-01&to=2026-07-19')).json();
    expect(j.comparison.previousRange).toEqual({ from: '2026-06-01', to: '2026-06-19' });
    const s = (await get('/api/v2/reports/period-summary?from=2026-07-01&to=2026-07-19')).json();
    expect(s.prevRange).toEqual({ from: '2026-06-01', to: '2026-06-19' });
  });
});
