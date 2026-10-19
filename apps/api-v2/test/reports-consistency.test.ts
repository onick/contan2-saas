// apps/api-v2/test/reports-consistency.test.ts · integration (skip sin DATABASE_URL).
// PR-9 · una sola definición de "% de ocupación" (personas en sala / aforo) en
// TODAS las salidas (dashboard, Excel de actividad y de período, CSV/JSON/Excel
// de asistencia, y el HTML de los tres PDF), + CSV con "Reservados" + PDFs con
// la misma cabecera unificada.
// Fixture: aforo 20 · 2 check-ins (uno con 1 acompañante) · 1 reserva → 3 personas = 15 %.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import ExcelJS from 'exceljs';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';
import { occupancyPct } from '../src/services/reports/metrics.js';
import { loadActivityReportData } from '../src/services/reports/report-data.js';
import { periodEngine } from '../src/services/reports/period-engine.js';
import { attendanceByActivity, parseRange } from '../src/services/report-data.js';
import { buildActivityPdfHtml } from '../src/services/reports/activity-pdf-template.js';
import { buildPeriodPdfHtml } from '../src/services/reports/period-pdf-template.js';
import { buildAttendancePdfHtml } from '../src/services/reports/attendance-pdf-template.js';

describe('occupancyPct', () => {
  it('personas / aforo redondeado; 0 sin aforo', () => {
    expect(occupancyPct(3, 20)).toBe(15);
    expect(occupancyPct(1, 3)).toBe(33);
    expect(occupancyPct(5, 0)).toBe(0);
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

run('consistencia de reportes · % ocupación, CSV Reservados, PDFs unificados', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `repcons-${stamp}`;
  const host = `${slug}.contan2.com`;
  const TOK = `repcons-adm-${stamp}`;
  const FROM = '2026-03-01';
  const TO = '2026-03-31';
  let orgId: string;
  let actId: string;
  const organization = { name: 'Centro Cons', slug, primaryColor: '#f39228', secondaryColor: '#31a3db', logoUrl: null, credentialLogoUrl: null };

  const mkUser = async () => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: orgId, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'Cons', last_name: `U${id.slice(0, 4)}`, email: null, phone: null, visit_count: 0,
    } as never).execute();
    return id;
  };
  const att = async (userId: string, opts: { children?: number; hold?: boolean }) =>
    db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, user_id: userId, activity_id: actId, activity_name: 'x',
      user_code: null, anonymous: false, companions_children: opts.children ?? 0,
      registered_at: '2026-03-10T20:10:00Z', checked_in_at: opts.hold ? null : '2026-03-10T20:10:00Z',
    } as never).execute();

  let ip = 0;
  const get = (url: string) => app.inject({
    method: 'GET', url: `/api/v2${url}`,
    headers: { host, 'x-forwarded-for': `10.9.0.${(ip++ % 250) + 1}`, cookie: `contan2_session=${TOK}` },
  });

  /** Textos de todas las celdas de todas las hojas. */
  const allCellText = async (raw: Buffer | Uint8Array) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(raw as never);
    const out: string[] = [];
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { out.push(String(c.value)); })));
    return out;
  };

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'Centro Cons', status: 'active', primary_color: '#f39228' } as never).returning('id').executeTakeFirstOrThrow()).id;
    const s = await db.insertInto('staff_members').values({ organization_id: orgId, email: `adm-${stamp}@t.local`, password_hash: 'x', full_name: 'S', status: 'active', role: 'admin' }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(TOK), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    actId = randomUUID();
    await db.insertInto('activities').values({
      id: actId, organization_id: orgId, name: 'Función Cons', type: 'cine', location: 'Sala', date: '2026-03-10T20:00:00Z',
      capacity: 20, enrolled_count: 3, status: 'finalizada', description: '', image_url: null, category: 'Ciclo Cons',
    } as never).execute();
    await att(await mkUser(), {});
    await att(await mkUser(), { children: 1 });
    await att(await mkUser(), { hold: true });
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

  it('dashboard (period-summary): 15 % en KPI y en top actividades', async () => {
    const res = await get(`/reports/period-summary?from=${FROM}&to=${TO}`);
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.kpis.occupancyPct).toBe(15);
    expect(j.topActivities[0].occupancyPct).toBe(15);
  });

  it('Excel de actividad: "% En sala" = 15 %', async () => {
    const res = await get(`/reports/activity/${actId}.xlsx`);
    expect(res.statusCode).toBe(200);
    const cells = await allCellText(res.rawPayload);
    expect(cells).toContain('15%');
    expect(cells).not.toContain('10%'); // 2 check-ins / 20 (fórmula vieja)
  });

  it('Excel de período: ocupación promedio y filas por actividad = 15 %', async () => {
    const res = await get(`/reports/period.xlsx?from=${FROM}&to=${TO}`);
    expect(res.statusCode).toBe(200);
    const cells = await allCellText(res.rawPayload);
    expect(cells.filter((c) => c === '15%').length).toBeGreaterThanOrEqual(2); // KPI + fila(s)
    expect(cells).not.toContain('10%');
  });

  it('asistencia por actividad: JSON, CSV y Excel coinciden (15 %) y llevan Reservados al final', async () => {
    const j = (await get(`/reports/attendance-by-activity?from=${FROM}&to=${TO}`)).json();
    expect(j.rows[0].occupancyPct).toBe(15);
    expect(j.totals.occupancyPct).toBe(15);
    expect(j.rows[0].reserved).toBe(1);
    expect(j.totals.reserved).toBe(1);

    const csv = (await get(`/reports/attendance-by-activity?from=${FROM}&to=${TO}&format=csv`)).body.replace(/^﻿/, '');
    const lines = csv.trim().split(/\r?\n/);
    const head = lines[0]!.split(',');
    expect(head[head.length - 1]).toBe('Reservados');
    expect(head[head.length - 2]).toBe('Ocupación %');
    const first = lines[1]!.split(',');
    expect(first[first.length - 1]).toBe('1');
    expect(first[first.length - 2]).toBe('15');
    const total = lines[2]!.split(',');
    expect(total[total.length - 1]).toBe('1');

    const x = await get(`/reports/attendance-by-activity?from=${FROM}&to=${TO}&format=xlsx`);
    const cells = await allCellText(x.rawPayload);
    expect(cells).toContain('15');
  });

  it('HTML de los tres PDF: 15 % y la MISMA cabecera de marca (cover + chip de logo + KPIs)', async () => {
    const period = await periodEngine(db as never, orgId, parseRange(FROM, TO));
    const periodHtml = await buildPeriodPdfHtml({ organization, period });

    const data = await loadActivityReportData(db as never, orgId, actId);
    expect(data).not.toBeNull();
    const activityHtml = await buildActivityPdfHtml({ organization, ...data! });

    const report = await attendanceByActivity(db as never, orgId, parseRange(FROM, TO));
    const attendanceHtml = await buildAttendancePdfHtml({ organization, report, category: null });

    const text = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text(periodHtml)).toContain('15%');
    expect(text(activityHtml)).toContain('15%');
    expect(text(attendanceHtml)).toContain('15%');
    expect(text(periodHtml)).not.toContain('10%');
    expect(text(activityHtml)).not.toContain('10%');

    for (const html of [periodHtml, activityHtml, attendanceHtml]) {
      expect(html).toContain('<section class="cover">');
      expect(html).toContain('class="cover-pill"');
      expect(html).toContain('--header-a: #f39228');
      expect(html).toContain('.cover-logo { background: #ffffff');
      expect(html).toContain('<section class="kpis');
    }
  });
});
