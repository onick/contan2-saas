// apps/api-v2/test/reports-tz.test.ts · PR-1 fix/reports-tz. Horas y agrupaciones
// de reportes en la zona del tenant (America/Santo_Domingo, UTC-4), no en UTC.
// Parte pura (sin DB): fmt.ts, parseRange, plantillas PDF. Parte integración
// (skip sin DATABASE_URL): Excel de actividad/período y byHour/byWeekday/daily del
// dashboard con borde de fin de mes. Pensado para correr con TZ=UTC (servidor real).

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';

// La TZ del centro se fija antes de importar src: REPORT_TZ se evalúa al cargar el
// módulo y otro archivo del mismo worker (checkin-tz.test.ts) la cambia a UTC.
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
import { fmtTimeTz, fmtDateTz, hourInTz, ymdInTz, zonedMidnight } from '../src/services/reports/fmt.js';
import { previousRange } from '../src/services/reports/period-summary.js';
import { buildActivityPdfHtml } from '../src/services/reports/activity-pdf-template.js';
import { buildPeriodPdfHtml } from '../src/services/reports/period-pdf-template.js';

describe('reportes TZ · helpers puros', () => {
  it('fmtTimeTz: 16:09Z -> 12:09 DR; fmtDateTz respeta el día DR', () => {
    expect(fmtTimeTz('2026-03-10T16:09:00Z')).toMatch(/^12:09/);
    expect(fmtDateTz('2026-04-01T02:30:00Z')).toMatch(/31/); // 31 mar 22:30 DR
    expect(hourInTz('2026-03-10T16:09:00Z')).toBe(12);
    expect(ymdInTz('2026-04-01T02:30:00Z')).toBe('2026-03-31');
  });

  it('parseRange: rango [00:00 DR, 00:00 DR del día siguiente)', () => {
    const r = parseRange('2026-03-31', '2026-03-31');
    expect(r.fromDate.toISOString()).toBe('2026-03-31T04:00:00.000Z');
    expect(r.toExclusive.toISOString()).toBe('2026-04-01T04:00:00.000Z');
    // Actividad 22:30 DR del 31-mar (= 02:30Z del 1-abr) cae dentro del 31-mar y fuera del 1-abr.
    const act = new Date('2026-04-01T02:30:00Z').getTime();
    expect(act >= r.fromDate.getTime() && act < r.toExclusive.getTime()).toBe(true);
    const abr = parseRange('2026-04-01', '2026-04-01');
    expect(act >= abr.fromDate.getTime() && act < abr.toExclusive.getTime()).toBe(false);
    expect(zonedMidnight('2026-01-01').toISOString()).toBe('2026-01-01T04:00:00.000Z');
  });

  it('previousRange: los N días calendario anteriores, en DR', () => {
    const p = previousRange(parseRange('2026-03-01', '2026-03-31'));
    expect(p.from).toBe('2026-01-29');
    expect(p.to).toBe('2026-02-28');
    expect(p.toExclusive.toISOString()).toBe('2026-03-01T04:00:00.000Z');
  });

  it('PDF de actividad: check-in e inicio en DR (12:09 / 12:00), sin hora UTC', async () => {
    const html = await buildActivityPdfHtml({
      organization: { name: 'Centro', primaryColor: '#0182a2', secondaryColor: '#ff6f00', logoUrl: null },
      activity: { id: 'a', name: 'Concierto', type: 'concierto', location: 'Sala', date: '2026-03-10T16:00:00Z', endDate: null, capacity: 100, enrolledCount: 0, status: 'finalizada', description: '', category: null },
      attendances: [{ userId: 'u', userCode: 'CCB-1', registeredAt: '2026-03-10T16:09:00Z', checkedInAt: '2026-03-10T16:09:00Z', anonymous: false, companionsChildren: 0, companionsAdults: 0 }],
      users: [{ id: 'u', code: 'CCB-1', firstName: 'A', lastName: 'B', email: null, phone: null, visitCount: 1, createdAt: '2026-01-01T00:00:00Z' }],
      affinities: [{ totalAttendances: 1 }],
      protocol: null,
    });
    expect(html).toMatch(/12:09/);
    expect(html).toMatch(/12:00/);
    expect(html).not.toMatch(/16:09|04:09|4:09 p/);
  });

  it('PDF de período: la actividad 22:30 DR del 31-mar se rotula 31 mar', async () => {
    const html = await buildPeriodPdfHtml({
      organization: { name: 'Centro', primaryColor: '#0182a2', secondaryColor: '#ff6f00', logoUrl: null },
      period: {
        range: { from: '2026-03-31T04:00:00.000Z', to: '2026-04-01T04:00:00.000Z' },
        summary: { activitiesCount: 1, attendancesCount: 0, uniqueAttendees: 0, avgOccupancy: 0, typesCount: 1, monthsSpan: 1 },
        activities: [{ id: 'a', name: 'Noche', type: 'cine', typeLabel: 'Cine', date: '2026-04-01T02:30:00.000Z', location: 'Sala', capacity: 10, status: 'finalizada', attendances: 0, occupancyPct: 0, enrolledCount: 0 }],
        topActivities: [], byType: [], byMonth: [], byDay: [], topUsers: [],
      },
    });
    expect(html).toMatch(/31 mar/i);
    expect(html).not.toMatch(/01 abr/i);
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('reportes TZ · integración (dashboard, Excel actividad/período)', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `reptz-${stamp}`;
  const host = `${slug}.contan2.com`;
  const TOK = `reptz-admin-${stamp}`;
  let orgId: string;
  let actNoon: string;

  const mkActivity = async (dateIso: string, name: string) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: orgId, name, type: 'concierto', location: 'Sala', date: dateIso,
      capacity: 100, enrolled_count: 0, status: 'finalizada', description: '', image_url: null, category: null,
    }).execute();
    return id;
  };
  const attend = async (act: string, at: string, user: string | null) => {
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, user_id: user, activity_id: act, activity_name: 'x',
      user_code: null, anonymous: user === null, companions_children: 0, registered_at: at, checked_in_at: at,
    } as never).execute();
  };
  let ip = 0;
  const get = (url: string) => app.inject({
    method: 'GET', url,
    headers: { host, 'x-forwarded-for': `10.7.0.${(ip++ % 250) + 1}`, cookie: `contan2_session=${TOK}` },
  });
  const sheetText = (wb: ExcelJS.Workbook): string => {
    const all: string[] = [];
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => all.push(String(c.value ?? '')))));
    return all.join('\n');
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'Centro TZ', status: 'active' } as never)
      .returning('id').executeTakeFirstOrThrow()).id;
    const s = await db.insertInto('staff_members').values({
      organization_id: orgId, email: `admin-tz-${stamp}@test.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin',
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(TOK), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
    const u = randomUUID();
    await db.insertInto('users').values({
      id: u, organization_id: orgId, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'Tz', last_name: 'Uno', email: null, phone: null, visit_count: 0,
    } as never).execute();
    // Mediodía: actividad 12:00 DR, check-in 12:09 DR (16:09Z), martes 10-mar.
    actNoon = await mkActivity('2026-03-10T16:00:00Z', 'TZ mediodia');
    await attend(actNoon, '2026-03-10T16:09:00Z', u);
    // Fin de mes: actividad 22:30 DR del 31-mar (= 02:30Z del 1-abr), check-in 22:45 DR.
    const actLate = await mkActivity('2026-04-01T02:30:00Z', 'TZ noche');
    await attend(actLate, '2026-04-01T02:45:00Z', null);
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
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
        db.selectFrom('staff_members').select('id').where('organization_id', '=', orgId)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  it('period-summary: byHour en 12 y 22 (DR) y byWeekday martes', async () => {
    const j = (await get('/api/v2/reports/period-summary?from=2026-03-01&to=2026-03-31')).json();
    const hours = Object.fromEntries(j.byHour.map((h: { hour: number; count: number }) => [h.hour, h.count]));
    expect(hours[12]).toBe(1);
    expect(hours[22]).toBe(1);
    expect(hours[16]).toBeUndefined();
    expect(hours[2]).toBeUndefined();
    // 10-mar y 31-mar (DR) son martes.
    expect(j.byWeekday.find((d: { weekday: number }) => d.weekday === 2).count).toBe(2);
    expect(j.byWeekday.find((d: { weekday: number }) => d.weekday === 3).count).toBe(0);
  });

  it('period-summary: la actividad 22:30 DR del 31-mar cuenta en marzo (día 31) y no en abril', async () => {
    const mar = (await get('/api/v2/reports/period-summary?from=2026-03-01&to=2026-03-31')).json();
    expect(mar.kpis.activities).toBe(2);
    expect(mar.daily[30]).toMatchObject({ label: '31 mar', current: 1, activities: 1 });
    expect(mar.daily[9]).toMatchObject({ label: '10 mar', current: 1 });
    const abr = (await get('/api/v2/reports/period-summary?from=2026-04-01&to=2026-04-30')).json();
    expect(abr.kpis.activities).toBe(0);
  });

  it('Excel de actividad: hora de check-in 12:09 (no 16:09)', async () => {
    const res = await get(`/api/v2/reports/activity/${actNoon}.xlsx`);
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const asist = wb.getWorksheet('Asistentes')!;
    const headers = (asist.getRow(1).values as unknown[]).slice(1) as string[];
    const hora = String(asist.getRow(2).getCell(headers.indexOf('Hora check-in') + 1).value);
    expect(hora).toMatch(/^12:09/);
    const txt = sheetText(wb);
    expect(txt).not.toMatch(/16:09|04:09|4:09 p/);
    expect(txt).toMatch(/12:00/); // inicio de la actividad
  }, 30_000);

  it('Excel de período: la actividad nocturna cae en su día DR (31 mar)', async () => {
    const res = await get('/api/v2/reports/period.xlsx?from=2026-03-31&to=2026-03-31');
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    const txt = sheetText(wb);
    expect(txt).toMatch(/TZ noche/);
    expect(txt).not.toMatch(/TZ mediodia/);
    expect(txt).toMatch(/31 mar/i);
    expect(txt).not.toMatch(/01 abr/i);
  }, 30_000);

  it('preview de período: byDay a fin de mes coherente (31-mar tiene 1 asistencia)', async () => {
    const j = (await get('/api/v2/reports/period/preview?from=2026-03-01&to=2026-03-31')).json();
    expect(j.summary.activitiesCount).toBe(2);
    expect(j.byDay).toHaveLength(31);
    expect(j.byDay.find((d: { date: string }) => d.date === '2026-03-31').attendances).toBe(1);
    expect(j.byDay.find((d: { date: string }) => d.date === '2026-03-10').attendances).toBe(1);
  });
});
