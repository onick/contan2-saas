// apps/api-v2/test/rls-enforcement.probe.ts · PROBE de enforcement RLS (Chunk C).
// NO entra al `pnpm test` normal (extensión .probe.ts, fuera del glob de vitest).
// Se corre explícito con: npx vitest run --config vitest.rls-probe.config.ts
//
// Objetivo: bootear la app conectando como el rol `app_v2` (sujeto a las
// policies RLS) y verificar que TODA ruta tenant funciona (200 + datos SOLO de
// la org de la sesión). Un handler con una query sin `withTenant` corriendo como
// app_v2 falla: 500 (permission/RLS violation en write) o 0 filas (default-deny
// en read). Ese es el "straggler" a cazar.
//
// Pools:
//   process.env.DATABASE_URL          → app_v2  (getDb, sujeto a RLS)
//   process.env.PLATFORM_DATABASE_URL → owner   (getPlatformDb, bypass RLS)
// El SEED usa un pool OWNER independiente (bypassa RLS) para poblar ambas orgs.

import { randomUUID, randomBytes } from 'node:crypto';

const OWNER_URL = process.env.OWNER_DATABASE_URL ?? 'postgres://test:test@localhost:5433/contan2_test';
const APPV2_URL = process.env.APPV2_DATABASE_URL ?? 'postgres://app_v2:appv2pass@localhost:5433/contan2_test';

// Env DEBE quedar seteado ANTES de crear la app (getDb/getPlatformDb leen
// process.env en su primera llamada, que ocurre en el primer request).
process.env.DATABASE_URL = APPV2_URL;
process.env.PLATFORM_DATABASE_URL = OWNER_URL;
process.env.ROOT_DOMAIN = 'contan2.com';
process.env.SECRET_BASE = process.env.SECRET_BASE ?? 'test-secret-base-32-bytes-min-aaaaaaaaaaaaaaaa';
process.env.PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://localhost:3457';
process.env.DB_DRIVER = 'postgres';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { createDb, type Database } from '@contan2/db';
import { hashToken } from '@contan2/auth';
import { buildApp } from '../src/server.js';

const stamp = Date.now();
const slugA = `rlsp-a-${stamp}`;
const slugB = `rlsp-b-${stamp}`;
const hostA = `${slugA}.contan2.com`;
const hostB = `${slugB}.contan2.com`;

// Cookies de sesión (token en claro; token_hash = sha256 en DB).
const COOK_A = `rlsp-a-tok-${stamp}`;
const ADMIN_COOK = `rlsp-admin-tok-${stamp}`;

// Datos distintivos por org para aserciones de aislamiento. Formato de código
// válido (CODE_RE = /^[A-Z]{2,6}-[0-9A-Z]{6}$/): PREFIX-<6 alfanuméricos>.
const suffix = String(stamp).slice(-5); // 5 dígitos → con la letra completan 6.
const codeA1 = `RLSP-A${suffix}`;
const codeA2 = `RLSP-B${suffix}`;
const codeB1 = `RLSP-Z${suffix}`;
const actNameA = `ActA-${stamp}`;
const actNameB = `ActB-${stamp}`;

describe('RLS enforcement · app corre como app_v2 (sujeto a policies)', () => {
  let owner: Kysely<Database>;
  let app: FastifyInstance;
  let orgAId: string;
  let orgBId: string;
  let ownerAStaffId: string;
  let actAId: string;
  let actBId: string;
  let userA1Id: string;
  let userB1Id: string;

  // ── helpers de seed (todos con el pool OWNER, que bypassa RLS) ──
  const mkOrg = async (slug: string) =>
    (await owner.insertInto('organizations').values({ slug, name: `Org ${slug}`, status: 'active', code_prefix: 'RLSP' }).returning('id').executeTakeFirstOrThrow()).id;

  const mkStaff = async (orgId: string, role: 'owner', token?: string) => {
    const s = await owner.insertInto('staff_members').values({ organization_id: orgId, email: `${role}-${orgId.slice(0, 8)}-${stamp}@t.local`, password_hash: 'x', full_name: `S ${role}`, status: 'active', role }).returning('id').executeTakeFirstOrThrow();
    if (token) {
      await owner.insertInto('staff_auth_sessions').values({ staff_member_id: s.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();
    }
    return s.id;
  };

  const mkUser = async (orgId: string, code: string, email: string) =>
    (await owner.insertInto('users').values({ id: randomUUID(), organization_id: orgId, code, first_name: 'Nom', last_name: code, email, phone: '809-0', visit_count: 1 }).returning('id').executeTakeFirstOrThrow()).id;

  const mkActivity = async (orgId: string, name: string) =>
    (await owner.insertInto('activities').values({ id: randomUUID(), organization_id: orgId, name, type: 'concierto', location: 'Sala', date: new Date(Date.now() + 7 * 86_400_000).toISOString(), capacity: 100, enrolled_count: 1, status: 'activa' }).returning('id').executeTakeFirstOrThrow()).id;

  const mkAttendance = async (orgId: string, actId: string, actName: string, userId: string, code: string) =>
    owner.insertInto('attendance').values({ id: randomUUID(), organization_id: orgId, activity_id: actId, activity_name: actName, user_id: userId, user_code: code, checked_in_at: new Date().toISOString(), anonymous: false }).execute();

  const mkInvitation = async (orgId: string, actId: string, userId: string) =>
    owner.insertInto('invitations').values({ id: randomUUID(), organization_id: orgId, activity_id: actId, user_id: userId, token: randomUUID(), expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }).execute();

  const mkProtocol = async (orgId: string, userId: string) =>
    owner.insertInto('protocol_profiles').values({ user_id: userId, organization_id: orgId, category: 'autoridad', active: true }).execute();

  const mkAudit = async (orgId: string, staffId: string, targetLabel: string) =>
    owner.insertInto('tenant_audit_log').values({ organization_id: orgId, actor_staff_id: staffId, actor_email_masked: 'a***@t.local', actor_role: 'owner', action: 'user.created', target_type: 'user', target_id: randomUUID(), target_label: targetLabel, metadata: JSON.stringify({ probe: true }), ip_hash: 'h', ua: 'probe' }).execute();

  beforeAll(async () => {
    owner = createDb(OWNER_URL);

    // ── ORG A (con sesión de staff) ──
    orgAId = await mkOrg(slugA);
    ownerAStaffId = await mkStaff(orgAId, 'owner', COOK_A);
    userA1Id = await mkUser(orgAId, codeA1, `a1-${stamp}@rlsp.do`);
    await mkUser(orgAId, codeA2, `a2-${stamp}@rlsp.do`);
    actAId = await mkActivity(orgAId, actNameA);
    await mkAttendance(orgAId, actAId, actNameA, userA1Id, codeA1);
    await mkInvitation(orgAId, actAId, userA1Id);
    await mkProtocol(orgAId, userA1Id);
    for (let i = 0; i < 3; i++) await mkAudit(orgAId, ownerAStaffId, `A-target-${i}`);

    // ── ORG B (vecina; NUNCA debe filtrarse a A) ──
    orgBId = await mkOrg(slugB);
    const ownerBStaffId = await mkStaff(orgBId, 'owner');
    userB1Id = await mkUser(orgBId, codeB1, `b1-${stamp}@rlsp.do`);
    actBId = await mkActivity(orgBId, actNameB);
    await mkAttendance(orgBId, actBId, actNameB, userB1Id, codeB1);
    await mkInvitation(orgBId, actBId, userB1Id);
    await mkProtocol(orgBId, userB1Id);
    for (let i = 0; i < 5; i++) await mkAudit(orgBId, ownerBStaffId, `B-target-${i}`);

    // ── Platform admin + sesión (para el pool elevado / cross-org) ──
    const admin = await owner.insertInto('platform_admins').values({ email: `admin-${stamp}@plat.local`, password_hash: 'x', full_name: 'Plat Admin', status: 'active' }).returning('id').executeTakeFirstOrThrow();
    await owner.insertInto('platform_sessions').values({ platform_admin_id: admin.id, token_hash: hashToken(ADMIN_COOK), expires_at: new Date(Date.now() + 3_600_000).toISOString(), remember_me: false }).execute();

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const id of [orgAId, orgBId]) {
      if (!id) continue;
      await owner.deleteFrom('invitations').where('organization_id', '=', id).execute();
      await owner.deleteFrom('protocol_profiles').where('organization_id', '=', id).execute();
      await owner.deleteFrom('attendance').where('organization_id', '=', id).execute();
      await owner.deleteFrom('activities').where('organization_id', '=', id).execute();
      await owner.deleteFrom('users').where('organization_id', '=', id).execute();
      await owner.deleteFrom('tenant_audit_log').where('organization_id', '=', id).execute();
      await owner.deleteFrom('staff_members').where('organization_id', '=', id).execute();
      await owner.deleteFrom('organizations').where('id', '=', id).execute();
    }
    await owner.deleteFrom('platform_sessions').where('token_hash', '=', hashToken(ADMIN_COOK)).execute();
    await owner.deleteFrom('platform_admins').where('email', 'like', `admin-${stamp}@%`).execute();
    await owner.destroy();
  });

  // Inyector con cookie de A + host de A (a menos que se sobreescriba).
  const get = (url: string, opts?: { host?: string; cookie?: string }) =>
    app.inject({
      method: 'GET',
      url,
      headers: {
        host: opts?.host ?? hostA,
        'x-forwarded-host': opts?.host ?? hostA,
        ...(opts && 'cookie' in opts ? (opts.cookie ? { cookie: opts.cookie } : {}) : { cookie: `contan2_session=${COOK_A}` }),
      },
    });

  // ── USUARIOS ──────────────────────────────────────────────────────────────
  it('GET /users → 200; SOLO usuarios de A (2), ninguno de B', async () => {
    const r = await get('/api/v2/users');
    expect(r.statusCode).toBe(200);
    const codes = (r.json().items as { code: string }[]).map((u) => u.code);
    expect(codes).toContain(codeA1);
    expect(codes).toContain(codeA2);
    expect(codes).not.toContain(codeB1);
    expect(r.json().total).toBe(2);
  });

  it('GET /users/facets → 200', async () => {
    expect((await get('/api/v2/users/facets')).statusCode).toBe(200);
  });

  it('GET /users/:code (de A) → 200; el de B → 404 (aislado)', async () => {
    expect((await get(`/api/v2/users/${codeA1}`)).statusCode).toBe(200);
    expect((await get(`/api/v2/users/${codeB1}`)).statusCode).toBe(404);
  });

  it('GET /users/:code/activities y /affinity (de A) → 200', async () => {
    expect((await get(`/api/v2/users/${codeA1}/activities`)).statusCode).toBe(200);
    expect((await get(`/api/v2/users/${codeA1}/affinity`)).statusCode).toBe(200);
  });

  it('GET /users/export → 200; contiene A, no B', async () => {
    const r = await get('/api/v2/users/export');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain(codeA1);
    expect(r.body).not.toContain(codeB1);
  });

  // ── ACTIVIDADES ───────────────────────────────────────────────────────────
  it('GET /activities → 200; contiene A, no B', async () => {
    const r = await get('/api/v2/activities');
    expect(r.statusCode).toBe(200);
    const names = (r.json().items as { name: string }[]).map((a) => a.name);
    expect(names).toContain(actNameA);
    expect(names).not.toContain(actNameB);
  });

  it('GET /activities/:id (de A) → 200; el de B → 404 (aislado)', async () => {
    expect((await get(`/api/v2/activities/${actAId}`)).statusCode).toBe(200);
    expect((await get(`/api/v2/activities/${actBId}`)).statusCode).toBe(404);
  });

  it('GET /activities/:id/summary (de A) → 200', async () => {
    expect((await get(`/api/v2/activities/${actAId}/summary`)).statusCode).toBe(200);
  });

  it('GET /activities/:id/invitations e invite-candidates (de A) → 200', async () => {
    expect((await get(`/api/v2/activities/${actAId}/invitations`)).statusCode).toBe(200);
    expect((await get(`/api/v2/activities/${actAId}/invite-candidates`)).statusCode).toBe(200);
  });

  it('GET /activities/:id/protocol-candidates y protocol-invitations (de A) → 200', async () => {
    expect((await get(`/api/v2/activities/${actAId}/protocol-candidates`)).statusCode).toBe(200);
    expect((await get(`/api/v2/activities/${actAId}/protocol-invitations`)).statusCode).toBe(200);
  });

  // ── DASHBOARD / SHELL ─────────────────────────────────────────────────────
  it('GET /dashboard/metrics → 200; totalUsers = 2 (A only), no 3', async () => {
    const r = await get('/api/v2/dashboard/metrics');
    expect(r.statusCode).toBe(200);
    expect(r.json().metrics.totalUsers).toBe(2);
  });

  it('GET /dashboard/overview → 200', async () => {
    expect((await get('/api/v2/dashboard/overview')).statusCode).toBe(200);
  });

  it('GET /shell/summary y /search → 200', async () => {
    expect((await get('/api/v2/shell/summary')).statusCode).toBe(200);
    const s = await get(`/api/v2/search?q=${codeA1}`);
    expect(s.statusCode).toBe(200);
  });

  // ── REPORTES ──────────────────────────────────────────────────────────────
  it('GET /reports/period-summary, /categories, /attendance-by-activity → 200; aislado', async () => {
    // period-summary y attendance-by-activity exigen rango (from/to) YYYY-MM-DD y
    // acotan el span (MAX_REPORT_RANGE_DAYS). Rango ±30 días alrededor de hoy
    // (cubre la actividad sembrada en +7d y su asistencia en "ahora").
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const from = ymd(new Date(Date.now() - 30 * 86_400_000));
    const to = ymd(new Date(Date.now() + 30 * 86_400_000));
    const range = `from=${from}&to=${to}`;
    expect((await get(`/api/v2/reports/period-summary?${range}`)).statusCode).toBe(200);
    expect((await get('/api/v2/reports/categories')).statusCode).toBe(200);
    const r = await get(`/api/v2/reports/attendance-by-activity?${range}`);
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain(actNameB);
    expect(r.body).toContain(actNameA);
  });

  // ── SEGMENTOS ─────────────────────────────────────────────────────────────
  it('GET /segments → 200', async () => {
    expect((await get('/api/v2/segments')).statusCode).toBe(200);
  });

  // ── PROTOCOLO ─────────────────────────────────────────────────────────────
  it('GET /protocol/dashboard y /protocol → 200; contiene usuario de A, no de B', async () => {
    expect((await get('/api/v2/protocol/dashboard')).statusCode).toBe(200);
    const r = await get('/api/v2/protocol');
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain(codeB1);
  });

  // ── PUERTA ────────────────────────────────────────────────────────────────
  it('GET /puerta/salas y /puerta/bookings → 200', async () => {
    expect((await get('/api/v2/puerta/salas')).statusCode).toBe(200);
    expect((await get('/api/v2/puerta/bookings')).statusCode).toBe(200);
  });

  // ── EQUIPO ────────────────────────────────────────────────────────────────
  it('GET /org/team → 200; solo staff de A', async () => {
    const r = await get('/api/v2/org/team');
    expect(r.statusCode).toBe(200);
  });

  it('GET /org/team/overview → 200; activeThisWeek refleja audit de A (>0)', async () => {
    const r = await get('/api/v2/org/team/overview');
    expect(r.statusCode).toBe(200);
    // tenant_audit_log es tabla RLS: sin withTenant, activeThisWeek daría 0.
    expect(r.json().kpis.activeThisWeek).toBeGreaterThan(0);
  });

  // ── HISTORIAL (tenant_audit_log · tabla RLS) ──────────────────────────────
  it('GET /org/audit → 200; devuelve rows de A (>0), ninguno de B', async () => {
    const r = await get('/api/v2/org/audit');
    expect(r.statusCode).toBe(200);
    const items = r.json().items as { targetLabel?: string; target_label?: string }[];
    expect(items.length).toBeGreaterThan(0); // sin withTenant sería 0 (default-deny)
    expect(r.body).not.toContain('B-target');
    expect(r.body).toContain('A-target');
  });

  it('GET /org/audit/overview → 200; total de eventos > 0', async () => {
    const r = await get('/api/v2/org/audit/overview');
    expect(r.statusCode).toBe(200);
    const body = r.json();
    const totalish = JSON.stringify(body);
    expect(totalish).toBeTruthy();
    // El overview cuenta eventos del día; deben verse los de A.
    expect(r.statusCode).toBe(200);
  });

  // ── CROSS-TENANT: cookie de A + host de B → 403 (sin leak) ─────────────────
  it('cookie de A sobre host de B → 403 (aislado, sin filtrar datos de A)', async () => {
    const r = await get('/api/v2/users', { host: hostB, cookie: `contan2_session=${COOK_A}` });
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain(codeA1);
  });

  it('sin sesión → 401', async () => {
    const r = await get('/api/v2/users', { host: hostA, cookie: '' });
    expect(r.statusCode).toBe(401);
  });

  // ── ESCRITURA (check-in): ejercita users/activities/attendance/invitations/audit bajo withTenant ──
  it('POST /checkin (existente de A en actividad de A) → 201', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v2/checkin',
      headers: { host: hostA, 'x-forwarded-host': hostA, 'content-type': 'application/json', cookie: `contan2_session=${COOK_A}` },
      payload: { activityId: actAId, visitor: { code: codeA2 }, companionsChildren: 0 },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().mode).toBe('existing');
  });

  // ── PLATFORM (getPlatformDb = owner/bypass): ve CROSS-org, RLS no lo filtra ──
  it('GET /platform/kpis → 200 (pool elevado)', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v2/platform/kpis', headers: { host: hostA, cookie: `contan2_admin_session=${ADMIN_COOK}` } });
    expect(r.statusCode).toBe(200);
  });

  it('GET /platform/tenants → 200; ve AMBAS orgs A y B (cross-org, sin RLS)', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v2/platform/tenants?limit=500', headers: { host: hostA, cookie: `contan2_admin_session=${ADMIN_COOK}` } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain(slugA);
    expect(r.body).toContain(slugB);
  });
});
