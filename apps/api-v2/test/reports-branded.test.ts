// apps/api-v2/test/reports-branded.test.ts · integration (skip sin DATABASE_URL).
// Reportería S2 (paridad v1): preview JSON con summary/deltas exactos sobre un
// fixture controlado; Excel de período y de actividad se RE-PARSEAN con exceljs
// (workbook válido + hojas esperadas); el PDF se prueba sólo si hay un Chromium
// local (PUPPETEER_EXECUTABLE_PATH o el de Playwright) — skip honesto si no.
// RBAC: operator 403; rango inválido 400; cross-tenant no contamina.

process.env.ROOT_DOMAIN = 'contan2.com';
process.env.TRUST_PROXY = '1';

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
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

// Chromium local para el render PDF (mac dev: el de Playwright; CI: ninguno → skip).
const PLAYWRIGHT_CHROME = `${homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH
  ?? (existsSync(PLAYWRIGHT_CHROME) ? PLAYWRIGHT_CHROME : null);
if (CHROME) process.env.PUPPETEER_EXECUTABLE_PATH = CHROME;

run('reportería branded · period/activity xlsx+pdf+preview', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;

  const stamp = Date.now();
  const slugA = `repbr-a-${stamp}`;
  const hostA = `${slugA}.contan2.com`;
  let orgAId: string;
  let orgBId: string;
  let actConcierto: string;
  const TOK = { admin: `rep-admin-${stamp}`, operator: `rep-oper-${stamp}` };

  // Rango del fixture: actividades el 2026-03-10 (concierto, cap 100) y
  // 2026-03-20 (cine, cap 50); período anterior (feb) con 1 actividad.
  const FROM = '2026-03-01';
  const TO = '2026-03-31';

  const mkStaff = async (token: string, role: 'admin' | 'operator') => {
    const s = await db.insertInto('staff_members').values({
      organization_id: orgAId, email: `${role}-rep-${stamp}@test.local`, password_hash: 'x',
      full_name: 'S', status: 'active', role,
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('staff_auth_sessions').values({
      staff_member_id: s.id, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
    }).execute();
  };
  const mkActivity = async (org: string, type: string, dateIso: string, capacity: number, category: string | null = null) => {
    const id = randomUUID();
    await db.insertInto('activities').values({
      id, organization_id: org, name: `Rep ${type} ${id.slice(0, 4)}`, type, location: 'Sala',
      date: dateIso, capacity, enrolled_count: 0, status: 'finalizada',
      description: '', image_url: null, category,
    }).execute();
    return id;
  };
  const mkUser = async (org: string, email: string | null = null) => {
    const id = randomUUID();
    await db.insertInto('users').values({
      id, organization_id: org, code: `CCB-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      first_name: 'Rep', last_name: `U${id.slice(0, 4)}`, email, phone: null, visit_count: 0,
    } as never).execute();
    return id;
  };
  const attend = async (org: string, act: string, user: string | null, at: string) => {
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: org, user_id: user, activity_id: act,
      activity_name: 'x', user_code: null, anonymous: user === null, companions_children: 0, registered_at: at,
    } as never).execute();
  };

  let ipSeq = 0;
  const get = (url: string, token: string | undefined = TOK.admin) =>
    app.inject({
      method: 'GET', url,
      headers: {
        host: hostA, 'x-forwarded-for': `10.5.0.${(ipSeq++ % 250) + 1}`,
        ...(token ? { cookie: `contan2_session=${token}` } : {}),
      },
    });

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    orgAId = (await db.insertInto('organizations').values({
      slug: slugA, name: 'Centro Reportes', status: 'active',
      primary_color: '#0182a2', secondary_color: '#ff6f00',
    } as never).returning('id').executeTakeFirstOrThrow()).id;
    orgBId = (await db.insertInto('organizations').values({ slug: `repbr-b-${stamp}`, name: 'Org B', status: 'active' })
      .returning('id').executeTakeFirstOrThrow()).id;
    await mkStaff(TOK.admin, 'admin');
    await mkStaff(TOK.operator, 'operator');

    // Marzo: concierto (3 asistencias: u1 nuevo, u2 con 1 previa, 1 anónimo) +
    // cine (1 asistencia u1) → 4 asistencias, 2 únicos.
    actConcierto = await mkActivity(orgAId, 'concierto', '2026-03-10T20:00:00Z', 100);
    const actCine = await mkActivity(orgAId, 'cine', '2026-03-20T19:00:00Z', 50, 'ciclo jazz');
    const u1 = await mkUser(orgAId, `rep-u1-${stamp}@test.local`);
    const u2 = await mkUser(orgAId);
    // Febrero (período anterior): 1 actividad con 1 asistencia de u2.
    const actFeb = await mkActivity(orgAId, 'taller', '2026-02-15T18:00:00Z', 20);
    await attend(orgAId, actFeb, u2, '2026-02-15T18:30:00Z');
    await attend(orgAId, actConcierto, u1, '2026-03-10T20:10:00Z');
    await attend(orgAId, actConcierto, u2, '2026-03-10T20:15:00Z');
    await attend(orgAId, actConcierto, null, '2026-03-10T20:20:00Z'); // walk-in
    await attend(orgAId, actCine, u1, '2026-03-20T19:05:00Z');
    // Ruido de otro tenant en el mismo rango.
    const actB = await mkActivity(orgBId, 'concierto', '2026-03-10T20:00:00Z', 10);
    await attend(orgBId, actB, await mkUser(orgBId), '2026-03-10T20:00:00Z');

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await db.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await db.deleteFrom('activities').where('organization_id', '=', id).execute();
      await db.deleteFrom('users').where('organization_id', '=', id).execute();
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
        db.selectFrom('staff_members').select('id').where('organization_id', '=', id)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await db.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await db.destroy();
    const { shutdownPdfRenderer } = await import('../src/services/reports/pdf-renderer.js');
    await shutdownPdfRenderer();
  });

  it('preview: summary exacto + deltas vs período anterior + byDay continuo', async () => {
    const res = await get(`/api/v2/reports/period/preview?from=${FROM}&to=${TO}`);
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.summary).toMatchObject({
      activitiesCount: 2, attendancesCount: 4, uniqueAttendees: 2,
    });
    expect(j.byType.find((t: { type: string }) => t.type === 'concierto').attendances).toBe(3);
    expect(j.byDay).toHaveLength(31); // marzo completo, días sin actividad en 0
    expect(j.byDay.find((d: { date: string }) => d.date === '2026-03-10').attendances).toBe(3);
    // deltas vs febrero (1 actividad, 1 asistencia): 2 act → +100%, 4 att → +300%
    expect(j.comparison.deltas.activitiesCount).toBe(100);
    expect(j.comparison.deltas.attendancesCount).toBe(300);
  });

  it('filtro por tipo y por categoría acotan el set', async () => {
    const cine = (await get(`/api/v2/reports/period/preview?from=${FROM}&to=${TO}&types=cine`)).json();
    expect(cine.summary.activitiesCount).toBe(1);
    expect(cine.summary.attendancesCount).toBe(1);
    const cat = (await get(`/api/v2/reports/period/preview?from=${FROM}&to=${TO}&categories=Ciclo Jazz`)).json();
    expect(cat.summary.activitiesCount).toBe(1); // match case-insensitive
  });

  it('period.xlsx: workbook re-parseable con contenido', async () => {
    const res = await get(`/api/v2/reports/period.xlsx?from=${FROM}&to=${TO}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('attachment');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(2);
    const all = wb.worksheets.map((w) => w.name).join(' · ');
    expect(all.toLowerCase()).toMatch(/resumen|actividades/);
  });

  it('activity.xlsx: workbook con asistentes; id ajeno → 404; extensión inválida → 400', async () => {
    const res = await get(`/api/v2/reports/activity/${actConcierto}.xlsx`);
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload);
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(2);

    expect((await get(`/api/v2/reports/activity/${randomUUID()}.xlsx`)).statusCode).toBe(404);
    expect((await get(`/api/v2/reports/activity/${actConcierto}.docx`)).statusCode).toBe(400);
  });

  it('RBAC: operator → 403 en preview/xlsx; rango inválido → 400', async () => {
    expect((await get(`/api/v2/reports/period/preview?from=${FROM}&to=${TO}`, TOK.operator)).statusCode).toBe(403);
    expect((await get(`/api/v2/reports/period.xlsx?from=${FROM}&to=${TO}`, TOK.operator)).statusCode).toBe(403);
    expect((await get('/api/v2/reports/period/preview?from=2026-13-99&to=x')).statusCode).toBe(400);
    expect((await get(`/api/v2/reports/period/preview?from=${TO}&to=${FROM}`)).statusCode).toBe(400);
  });

  (CHROME ? it : it.skip)('period.pdf y activity.pdf: PDFs reales (magic %PDF)', async () => {
    const p1 = await get(`/api/v2/reports/period.pdf?from=${FROM}&to=${TO}`);
    expect(p1.statusCode).toBe(200);
    expect(p1.headers['content-type']).toBe('application/pdf');
    expect(p1.rawPayload.subarray(0, 4).toString()).toBe('%PDF');

    const p2 = await get(`/api/v2/reports/activity/${actConcierto}.pdf`);
    expect(p2.statusCode).toBe(200);
    expect(p2.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
