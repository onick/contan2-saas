// apps/api-v2/test/reports-rbac.test.ts · integration (skip sin DATABASE_URL).
// PR-R2 · REP-A14: RBAC de Reportes en la API como fuente de verdad.
//   · LECTURA (period-summary, categories, agent) → owner/admin/operator/consulta/puerta
//   · EXPORT  (attendance, month, activity, period*) → owner/admin/puerta
//   · PROTOCOLO (protocol.xlsx)                    → owner/admin/protocolo
// protocolo / biblioteca reciben 403 en español en todo lo de lectura.

process.env.ROOT_DOMAIN = 'contan2.com';

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import ExcelJS from 'exceljs';
import { buildApp } from '../src/server.js';
import { REPORT_READ_ROLES, REPORT_EXPORT_ROLES, PROTOCOL_REPORT_ROLES } from '../src/rbac-roles.js';

const DATABASE_URL = process.env.DATABASE_URL;
const run = DATABASE_URL ? describe : describe.skip;

const ROLES = ['owner', 'admin', 'operator', 'consulta', 'puerta', 'protocolo', 'biblioteca'] as const;
type Role = (typeof ROLES)[number];

const READ: ReadonlySet<Role> = new Set(['owner', 'admin', 'operator', 'consulta', 'puerta']);
const EXPORT: ReadonlySet<Role> = new Set(['owner', 'admin', 'puerta']);
const PROTOCOL: ReadonlySet<Role> = new Set(['owner', 'admin', 'protocolo']);

describe('conjuntos de roles de reportes', () => {
  it('REPORT_READ_ROLES / REPORT_EXPORT_ROLES / PROTOCOL_REPORT_ROLES', () => {
    expect([...REPORT_READ_ROLES].sort()).toEqual([...READ].sort());
    expect([...REPORT_EXPORT_ROLES].sort()).toEqual([...EXPORT].sort());
    expect([...PROTOCOL_REPORT_ROLES].sort()).toEqual([...PROTOCOL].sort());
  });
});

run('RBAC en la API · Reportes', () => {
  let db: Kysely<Database>;
  let app: FastifyInstance;
  const stamp = Date.now();
  const slug = `reprbac-${stamp}`;
  const host = `${slug}.contan2.com`;
  let orgId: string;
  let actId: string;
  const tok = (r: Role) => `reprbac-${r}-${stamp}`;
  let ipSeq = 0;
  const Q = 'from=2026-06-01&to=2026-06-30';

  const call = (method: 'GET' | 'POST', url: string, role: Role, body?: unknown) =>
    app.inject({
      method, url,
      headers: {
        host, cookie: `contan2_session=${tok(role)}`,
        'x-forwarded-for': `10.7.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { payload: (body ?? {}) as object } : {}),
    });

  beforeAll(async () => {
    process.env.TRUST_PROXY = '1';
    db = createDb(DATABASE_URL);
    orgId = (await db.insertInto('organizations').values({ slug, name: 'Rep RBAC', status: 'active' })
      .returning('id').executeTakeFirstOrThrow()).id;
    for (const role of ROLES) {
      const st = await db.insertInto('staff_members').values({
        organization_id: orgId, email: `${role}-${stamp}@t.local`, password_hash: 'x',
        full_name: `S ${role}`, status: 'active', role,
      } as never).returning('id').executeTakeFirstOrThrow();
      await db.insertInto('staff_auth_sessions').values({
        staff_member_id: st.id, token_hash: hashToken(tok(role)),
        expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false,
      }).execute();
    }
    actId = randomUUID();
    await db.insertInto('activities').values({
      id: actId, organization_id: orgId, name: 'Act RBAC', type: 'concierto', location: 'Sala',
      date: '2026-06-10T22:00:00Z', capacity: 50, enrolled_count: 0, status: 'activa',
      description: '', category: 'Ciclo',
    } as never).execute();
    const uid = randomUUID();
    await db.insertInto('users').values({
      id: uid, organization_id: orgId, code: 'CCB-PII001', first_name: 'Ana', last_name: 'Pii',
      email: `ana-pii-${stamp}@secreto.test`, phone: '809-555-7777', visit_count: 3,
    } as never).execute();
    await db.insertInto('attendance').values({
      id: randomUUID(), organization_id: orgId, user_id: uid, activity_id: actId,
      activity_name: 'x', user_code: null, anonymous: false, companions_children: 0,
      registered_at: '2026-06-10T22:05:00Z', checked_in_at: '2026-06-10T22:05:00Z',
    } as never).execute();
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) {
      await db.deleteFrom('attendance').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('users').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('tenant_audit_log').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('activities').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('staff_auth_sessions').where('staff_member_id', 'in',
        db.selectFrom('staff_members').select('id').where('organization_id', '=', orgId)).execute();
      await db.deleteFrom('staff_members').where('organization_id', '=', orgId).execute();
      await db.deleteFrom('organizations').where('id', '=', orgId).execute();
    }
    await db.destroy();
  });

  const gate = async (method: 'GET' | 'POST', url: string, allowed: ReadonlySet<Role>, body?: unknown) => {
    for (const role of ROLES) {
      const res = await call(method, url, role, body);
      if (allowed.has(role)) {
        expect(res.statusCode, `${method} ${url} como ${role}`).toBeLessThan(300);
      } else {
        expect(res.statusCode, `${method} ${url} como ${role}`).toBe(403);
        expect((res.json() as { error: string }).error).toMatch(/^No tienes permiso/);
      }
    }
  };

  it('GET period-summary → lectura (protocolo/biblioteca 403)', async () => {
    await gate('GET', `/api/v2/reports/period-summary?${Q}`, READ);
  });
  it('GET categories → lectura', async () => {
    await gate('GET', '/api/v2/reports/categories', READ);
  });
  it('POST agent → lectura', async () => {
    await gate('POST', '/api/v2/reports/agent', READ, { query: 'ayuda' });
  });
  it('GET attendance-by-activity → export (operator/consulta 403)', async () => {
    await gate('GET', `/api/v2/reports/attendance-by-activity?${Q}`, EXPORT);
  });
  it('GET month.xlsx → export', async () => {
    await gate('GET', '/api/v2/reports/month.xlsx?year=2026&month=6', EXPORT);
  });
  it('GET activity/:id.xlsx → export', async () => {
    await gate('GET', `/api/v2/reports/activity/${actId}.xlsx`, EXPORT);
  });
  it('GET period.xlsx → export (puerta sigue exportando)', async () => {
    await gate('GET', `/api/v2/reports/period.xlsx?${Q}`, EXPORT);
  });
  it('GET period.pdf y activity pdf → 403 para roles sin export (antes de renderizar)', async () => {
    for (const role of ROLES.filter((r) => !EXPORT.has(r))) {
      expect((await call('GET', `/api/v2/reports/period.pdf?${Q}`, role)).statusCode, role).toBe(403);
      expect((await call('GET', `/api/v2/reports/activity/${actId}.pdf`, role)).statusCode, role).toBe(403);
    }
  });
  it('GET protocol.xlsx → owner/admin/protocolo', async () => {
    await gate('GET', '/api/v2/reports/protocol.xlsx', PROTOCOL);
  });
  it('GET /attendance (registros) → lectura', async () => {
    await gate('GET', '/api/v2/attendance', READ);
  });
  it('sin sesión → 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v2/reports/period-summary?${Q}`, headers: { host } });
    expect(res.statusCode).toBe(401);
  });
  it('el 403 no filtra agregados', async () => {
    const res = await call('GET', `/api/v2/reports/period-summary?${Q}`, 'protocolo');
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.json())).not.toMatch(/activitiesCount|attendancesCount/);
  });

  // ── REP-A08 · PII fuera de los informes ────────────────────────────────────
  const sheetText = async (buf: Buffer): Promise<{ names: string[]; text: string }> => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const out: string[] = [];
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { out.push(String(c.value ?? '')); })));
    return { names: wb.worksheets.map((w) => w.name), text: out.join('\n') };
  };
  const EMAIL_RE = /@/;
  const PHONE_RE = /\d{3}[-\s]?\d{3}[-\s]?\d{4}/;

  it('period.xlsx (también para puerta): Top visitantes con nombre y código, sin correo ni teléfono', async () => {
    for (const role of ['admin', 'puerta'] as Role[]) {
      const res = await call('GET', `/api/v2/reports/period.xlsx?${Q}`, role);
      expect(res.statusCode).toBe(200);
      const { names, text } = await sheetText(res.rawPayload);
      expect(names).toContain('Top visitantes');
      expect(text).toContain('CCB-PII001');
      expect(text).toContain('Ana');
      expect(text).not.toMatch(EMAIL_RE);
      expect(text).not.toMatch(PHONE_RE);
      expect(text).not.toContain('Email');
      expect(text).not.toContain('Teléfono');
    }
  });

  it('plantilla PDF de período: sin correo ni teléfono', async () => {
    const { buildPeriodPdfHtml } = await import('../src/services/reports/period-pdf-template.js');
    const { periodEngine } = await import('../src/services/reports/period-engine.js');
    const { parseRange } = await import('../src/services/report-data.js');
    const period = await periodEngine(db as never, orgId, parseRange('2026-06-01', '2026-06-30'));
    expect(period.current.topUsers.length).toBeGreaterThan(0);
    expect(JSON.stringify(period.current.topUsers)).not.toMatch(/email|phone|secreto|555-7777/);
    const html = await buildPeriodPdfHtml({ organization: { name: 'Org', primaryColor: '#0182a2', logoUrl: null }, period });
    expect(html).toContain('CCB-PII001');
    expect(html).not.toContain('secreto.test');
    expect(html).not.toContain('555-7777');
    expect(html).not.toMatch(/<th>Email<\/th>/);
  });

  it('informe por actividad: contacto solo para owner/admin; puerta recibe la lista sin correo ni teléfono', async () => {
    for (const role of ['owner', 'admin'] as Role[]) {
      const { text } = await sheetText((await call('GET', `/api/v2/reports/activity/${actId}.xlsx`, role)).rawPayload);
      expect(text, role).toContain('secreto.test');
      expect(text, role).toContain('555-7777');
    }
    const res = await call('GET', `/api/v2/reports/activity/${actId}.xlsx`, 'puerta');
    expect(res.statusCode).toBe(200);
    const { text } = await sheetText(res.rawPayload);
    expect(text).toContain('CCB-PII001');
    expect(text).not.toMatch(EMAIL_RE);
    expect(text).not.toMatch(PHONE_RE);
    expect(text).not.toContain('Teléfono');
  });

  it('CSV de asistencia por actividad: sin PII de personas', async () => {
    const res = await call('GET', `/api/v2/reports/attendance-by-activity?${Q}&format=csv`, 'puerta');
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('secreto.test');
    expect(res.body).not.toMatch(PHONE_RE);
  });
});
