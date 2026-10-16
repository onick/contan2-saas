// q3-rbac/rbac.spec.ts · matriz RBAC punto a punto (plan 1.4) contra STAGING.
// Con el storageState de cada rol (owner, admin, operator, consulta, puerta, protocolo, biblioteca)
// se piden los endpoints BFF de /app/**/api/** y las rutas de UI. Cada fila declara:
//   allowed   -> el rol NO debe recibir 401/403 (pasa el guard; con cuerpo invalido recibe 4xx de validacion)
//   forbidden -> el rol DEBE recibir 403
// Los roles que no estan en ninguna lista no se afirman (se documentan como observacion).
// Las escrituras usan cuerpos invalidos o ids inexistentes: aunque el guard dejara pasar, no escriben nada.
// Resultado esperado de los fixes B9: H1 (check-in), H2 (padron con PII), H3 (puerta/registrar).
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures/test';
import { e2eEmail } from '../../fixtures/data';
import { ROLES, type Role } from '../../fixtures/roles';
import { apiFor, cachedFixture, createActivity, createVisitor, fakeUuid, jsonOf } from '../../support/q3-api';

const ALL: Role[] = [...ROLES];
const ADMINS: Role[] = ['owner', 'admin'];
const OPS: Role[] = ['owner', 'admin', 'operator'];
const DOOR: Role[] = ['owner', 'admin', 'operator', 'puerta'];
const PADRON: Role[] = ['owner', 'admin', 'operator', 'consulta', 'puerta'];
const without = (...keep: Role[]): Role[] => ALL.filter((r) => !keep.includes(r));

type Sev = 'S0' | 'S1' | 'S2' | 'S3';
interface Row {
  id: string;
  sev: Sev;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: (c: Ctx) => string;
  body?: (c: Ctx) => unknown;
  /** multipart sin archivo (BFF que exige multipart) */
  multipart?: boolean;
  headers?: Record<string, string>;
  allowed: Role[];
  forbidden: Role[];
  note?: string;
}
interface Ctx {
  actId: string;
  visitorCode: string;
  visitorId: string;
}

const apis = {} as Record<Role, APIRequestContext>;
const ctx: Ctx = { actId: '', visitorCode: '', visitorId: '' };
let fixturesReady = false;

// Deterministico: sin reintentos (un reintento reiniciaria el worker y repetiria el alta de datos).
test.describe.configure({ retries: 0 });

test.beforeAll(async () => {
  for (const r of ROLES) apis[r] = await apiFor(r);
  const fx = await cachedFixture('rbac', async () => {
    const owner = apis.owner;
    const v = await createVisitor(owner, 1, 'RBAC');
    const a = await createActivity(owner, 'RBAC actividad');
    // Una invitacion de audiencia real para que /invitations devuelva datos (y se pueda detectar fuga de PII).
    const inv = await owner.post(`/app/actividades/api/${a.id}/invite-existing`, { data: { userIds: [v.id] } });
    if (inv.status() !== 201) throw new Error(`precondicion invite-existing: HTTP ${inv.status()}`);
    return { visitorCode: v.code, visitorId: v.id, actId: a.id };
  });
  Object.assign(ctx, fx);
  fixturesReady = true;
});

test.afterAll(async () => {
  for (const r of ROLES) await apis[r]?.dispose();
});

const FAKE = fakeUuid();
const g = (p: string | ((c: Ctx) => string)) => (typeof p === 'string' ? () => p : p);

const ROWS: Row[] = [
  // ---- Lecturas: PII del padron (H2) ------------------------------------------------------------
  { id: 'RBAC-R01', sev: 'S0', method: 'GET', path: (c) => `/app/check-in/api/visitors?q=${encodeURIComponent(c.visitorCode)}`, allowed: PADRON, forbidden: ['protocolo', 'biblioteca'], note: 'busqueda de visitantes devuelve nombre+email' },
  { id: 'RBAC-R02', sev: 'S0', method: 'GET', path: g('/app/check-in/api/recent'), allowed: PADRON, forbidden: ['protocolo', 'biblioteca'], note: 'feed de check-ins devuelve nombre+codigo' },
  { id: 'RBAC-R03', sev: 'S0', method: 'GET', path: (c) => `/app/usuarios/api/${c.visitorCode}/detail`, allowed: PADRON, forbidden: ['protocolo', 'biblioteca'] },
  { id: 'RBAC-R04', sev: 'S0', method: 'GET', path: (c) => `/app/usuarios/api/${c.visitorCode}/activities`, allowed: PADRON, forbidden: ['protocolo', 'biblioteca'] },
  { id: 'RBAC-R05', sev: 'S0', method: 'GET', path: (c) => `/app/usuarios/api/${c.visitorCode}/affinity`, allowed: PADRON, forbidden: ['protocolo', 'biblioteca'] },
  { id: 'RBAC-R06', sev: 'S1', method: 'GET', path: (c) => `/app/actividades/api/${c.actId}/invitations`, allowed: PADRON, forbidden: ['protocolo', 'biblioteca'], note: 'lista de invitados: nombre+email+codigo' },
  { id: 'RBAC-R07', sev: 'S1', method: 'GET', path: (c) => `/app/actividades/api/${c.actId}/invite-candidates`, allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-R08', sev: 'S1', method: 'GET', path: (c) => `/app/actividades/api/${c.actId}/protocol-candidates`, allowed: ['owner', 'admin', 'protocolo'], forbidden: without('owner', 'admin', 'protocolo') },
  { id: 'RBAC-R09', sev: 'S1', method: 'GET', path: (c) => `/app/actividades/api/${c.actId}/protocol-invitations`, allowed: ['owner', 'admin', 'protocolo', 'puerta'], forbidden: without('owner', 'admin', 'protocolo', 'puerta') },
  // ---- Lecturas: modulos de gestion ------------------------------------------------------------
  { id: 'RBAC-R10', sev: 'S1', method: 'GET', path: g('/app/equipo/api/team'), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-R11', sev: 'S1', method: 'GET', path: g('/app/equipo/api/overview'), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-R12', sev: 'S1', method: 'GET', path: g('/app/equipo/api/invitations'), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-R13', sev: 'S2', method: 'GET', path: g('/app/equipo/api/activity'), allowed: ADMINS, forbidden: ['operator', 'consulta', 'protocolo', 'biblioteca'], note: 'puerta no se afirma (lo lee hoy; ver observacion)' },
  { id: 'RBAC-R14', sev: 'S1', method: 'GET', path: g('/app/historial/api/audit'), allowed: ['owner', 'admin'], forbidden: ['operator', 'consulta', 'protocolo', 'biblioteca'], note: 'puerta: H6, ver test dedicado' },
  { id: 'RBAC-R15', sev: 'S1', method: 'GET', path: g('/app/historial/api/overview'), allowed: ['owner', 'admin'], forbidden: ['operator', 'consulta', 'protocolo', 'biblioteca'], note: 'puerta: H6' },
  { id: 'RBAC-R16', sev: 'S1', method: 'GET', path: g('/app/reportes/api/month'), allowed: ['owner', 'admin', 'puerta'], forbidden: ['operator', 'consulta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-R17', sev: 'S1', method: 'GET', path: g('/app/reportes/api/attendance'), allowed: ['owner', 'admin', 'puerta'], forbidden: ['operator', 'consulta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-R18', sev: 'S1', method: 'GET', path: g('/app/reportes/api/period'), allowed: ['owner', 'admin', 'puerta'], forbidden: ['operator', 'consulta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-R19', sev: 'S1', method: 'GET', path: g('/app/reportes/api/protocol'), allowed: ['owner', 'admin', 'protocolo'], forbidden: ['operator', 'consulta', 'puerta', 'biblioteca'] },
  { id: 'RBAC-R20', sev: 'S1', method: 'GET', path: g('/app/protocolo/api'), allowed: ['owner', 'admin', 'protocolo', 'puerta'], forbidden: ['operator', 'consulta', 'biblioteca'] },
  { id: 'RBAC-R21', sev: 'S1', method: 'GET', path: g('/app/protocolo/api/dashboard'), allowed: ['owner', 'admin', 'protocolo', 'puerta'], forbidden: ['operator', 'consulta', 'biblioteca'] },
  { id: 'RBAC-R22', sev: 'S1', method: 'GET', path: g('/app/usuarios/api/export'), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-R23', sev: 'S1', method: 'GET', path: g('/app/usuarios/api/import/template'), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-R24', sev: 'S2', method: 'GET', path: g('/app/segmentos/e2e/api/export'), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-R25', sev: 'S2', method: 'GET', path: g('/app/puerta/api/bookings'), allowed: ['owner', 'admin', 'operator', 'puerta'], forbidden: ['protocolo', 'biblioteca'], note: 'reservas de salas: datos de contacto de visitantes' },
  { id: 'RBAC-R26', sev: 'S2', method: 'GET', path: g('/app/puerta/api/export'), allowed: ['owner', 'admin', 'operator', 'puerta'], forbidden: ['protocolo', 'biblioteca'], note: 'xlsx de salas permanentes' },
  { id: 'RBAC-R27', sev: 'S3', method: 'GET', path: g('/app/api/shell/summary'), allowed: ALL, forbidden: [] },
  { id: 'RBAC-R28', sev: 'S3', method: 'GET', path: g('/app/cuenta/api/me'), allowed: ALL, forbidden: [] },
  { id: 'RBAC-R29', sev: 'S3', method: 'GET', path: g('/app/cuenta/api/sessions'), allowed: ALL, forbidden: [] },
  // ---- Escrituras: check-in y puerta (H1, H3) ---------------------------------------------------
  { id: 'RBAC-W01', sev: 'S1', method: 'POST', path: g('/app/check-in/api/checkin'), body: () => ({ activityId: FAKE, visitor: { code: 'CCB-ZZZZZZ' } }), allowed: DOOR, forbidden: ['consulta', 'protocolo', 'biblioteca'], note: 'H1' },
  { id: 'RBAC-W02', sev: 'S1', method: 'POST', path: g('/app/check-in/api/anonymous'), body: () => ({ activityId: FAKE }), headers: { 'idempotency-key': 'e2e-rbac-no-write' }, allowed: DOOR, forbidden: ['consulta', 'protocolo', 'biblioteca'], note: 'H1' },
  { id: 'RBAC-W03', sev: 'S1', method: 'POST', path: g('/app/puerta/api/registrar'), body: () => ({}), allowed: DOOR, forbidden: ['consulta', 'protocolo', 'biblioteca'], note: 'H3' },
  { id: 'RBAC-W04', sev: 'S1', method: 'POST', path: g('/app/puerta/api/bookings'), body: () => ({}), allowed: ['owner', 'admin', 'operator', 'puerta'], forbidden: ['consulta', 'protocolo', 'biblioteca'], note: 'crear reserva de sala' },
  { id: 'RBAC-W05', sev: 'S1', method: 'PATCH', path: () => `/app/puerta/api/bookings/${FAKE}`, body: () => ({}), allowed: ['owner', 'admin', 'operator', 'puerta'], forbidden: ['consulta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-W06', sev: 'S1', method: 'POST', path: () => `/app/puerta/api/bookings/${FAKE}/checkin`, body: () => ({}), allowed: ['owner', 'admin', 'operator', 'puerta'], forbidden: ['consulta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-W07', sev: 'S1', method: 'POST', path: () => `/app/puerta/api/salas/${FAKE}/occupancy`, body: () => ({}), allowed: ['owner', 'admin', 'operator', 'puerta'], forbidden: ['consulta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-W08', sev: 'S1', method: 'PATCH', path: () => `/app/check-in/api/attendance/${FAKE}`, body: () => ({ companionsAdults: 0 }), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W09', sev: 'S1', method: 'DELETE', path: () => `/app/check-in/api/attendance/${FAKE}`, allowed: ADMINS, forbidden: without(...ADMINS) },
  // ---- Escrituras: padron (H2 complemento) ------------------------------------------------------
  { id: 'RBAC-W10', sev: 'S1', method: 'POST', path: g('/app/usuarios/api'), body: () => ({}), allowed: OPS, forbidden: ['consulta', 'puerta', 'protocolo', 'biblioteca'], note: 'crear persona: owner/admin/operator' },
  { id: 'RBAC-W11', sev: 'S1', method: 'PATCH', path: () => `/app/usuarios/api/CCB-ZZZZZZ`, body: () => ({}), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W12', sev: 'S1', method: 'POST', path: () => `/app/usuarios/api/CCB-ZZZZZZ/archive`, allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W13', sev: 'S1', method: 'POST', path: () => `/app/usuarios/api/CCB-ZZZZZZ/reactivate`, allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W14', sev: 'S1', method: 'POST', path: g('/app/usuarios/api/import'), multipart: true, allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W15', sev: 'S1', method: 'POST', path: g('/app/usuarios/api/bulk-credentials'), body: () => ({}), allowed: ADMINS, forbidden: without(...ADMINS) },
  // ---- Escrituras: actividades ------------------------------------------------------------------
  { id: 'RBAC-W16', sev: 'S1', method: 'POST', path: g('/app/actividades/api'), body: () => ({}), allowed: OPS, forbidden: ['consulta', 'puerta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-W17', sev: 'S1', method: 'POST', path: g('/app/actividades/api/with-cover'), multipart: true, allowed: OPS, forbidden: ['consulta', 'puerta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-W18', sev: 'S1', method: 'PATCH', path: () => `/app/actividades/api/${FAKE}`, body: () => ({}), allowed: OPS, forbidden: ['consulta', 'puerta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-W19', sev: 'S1', method: 'PATCH', path: () => `/app/actividades/api/${FAKE}/status`, body: () => ({ status: 'finalizada' }), allowed: OPS, forbidden: ['consulta', 'puerta', 'protocolo', 'biblioteca'] },
  { id: 'RBAC-W20', sev: 'S1', method: 'DELETE', path: () => `/app/actividades/api/${FAKE}`, allowed: ADMINS, forbidden: without(...ADMINS), note: 'operator 403 (plan)' },
  { id: 'RBAC-W21', sev: 'S1', method: 'POST', path: () => `/app/actividades/api/${FAKE}/invitations`, body: () => ({}), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W22', sev: 'S1', method: 'POST', path: () => `/app/actividades/api/${FAKE}/invite-existing`, body: () => ({}), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W23', sev: 'S1', method: 'POST', path: () => `/app/actividades/api/${FAKE}/invitations/${FAKE}/cancel`, body: () => ({}), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W24', sev: 'S1', method: 'POST', path: () => `/app/actividades/api/${FAKE}/import-guests`, multipart: true, allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W25', sev: 'S1', method: 'POST', path: () => `/app/actividades/api/${FAKE}/protocol-invitations`, body: () => ({}), allowed: ['owner', 'admin', 'protocolo'], forbidden: ['operator', 'consulta', 'puerta', 'biblioteca'] },
  { id: 'RBAC-W26', sev: 'S1', method: 'POST', path: g('/app/actividades/api/programs'), body: () => ({}), allowed: ADMINS, forbidden: without(...ADMINS) },
  // ---- Escrituras: protocolo, equipo, identidad -------------------------------------------------
  { id: 'RBAC-W27', sev: 'S1', method: 'POST', path: g('/app/protocolo/api'), body: () => ({}), allowed: ['owner', 'admin', 'protocolo'], forbidden: ['operator', 'consulta', 'puerta', 'biblioteca'] },
  { id: 'RBAC-W28', sev: 'S1', method: 'PATCH', path: () => `/app/protocolo/api/${FAKE}`, body: () => ({}), allowed: ['owner', 'admin', 'protocolo'], forbidden: ['operator', 'consulta', 'puerta', 'biblioteca'] },
  { id: 'RBAC-W29', sev: 'S1', method: 'POST', path: g('/app/equipo/api/invitations'), body: () => ({}), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W30', sev: 'S1', method: 'POST', path: () => `/app/equipo/api/invitations/${FAKE}`, body: () => ({ action: 'revoke' }), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W31', sev: 'S1', method: 'PATCH', path: () => `/app/equipo/api/${FAKE}/role`, body: () => ({ role: 'operator' }), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W32', sev: 'S1', method: 'PATCH', path: () => `/app/equipo/api/${FAKE}/status`, body: () => ({ status: 'active' }), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W33', sev: 'S1', method: 'PATCH', path: g('/app/identidad/api/branding'), body: () => ({}), allowed: ADMINS, forbidden: without(...ADMINS) },
  { id: 'RBAC-W34', sev: 'S1', method: 'POST', path: g('/app/identidad/api/logo'), multipart: true, allowed: ADMINS, forbidden: without(...ADMINS) },
];

async function call(api: APIRequestContext, row: Row, c: Ctx): Promise<number> {
  const url = row.path(c);
  const opts: Parameters<APIRequestContext['fetch']>[1] = { method: row.method, maxRedirects: 0, timeout: 40_000 };
  if (row.headers) opts.headers = row.headers;
  if (row.multipart) opts.multipart = { note: 'e2e-sin-archivo' };
  else if (row.body) opts.data = row.body(c);
  const res = await api.fetch(url, opts);
  return res.status();
}

test.describe('RBAC por rol: BFF /app/**/api/**', () => {
  for (const row of ROWS) {
    const tags = row.sev === 'S0' ? ['@smoke'] : [];
    test(`${row.id} [${row.sev}] ${row.method} ${row.path({ actId: ':act', visitorCode: ':code', visitorId: ':id' }).replace(/\?.*/, '')}${row.note ? ` (${row.note})` : ''}`, { tag: tags }, async () => {
      expect(fixturesReady, 'precondiciones').toBe(true);
      const bad: string[] = [];
      for (const role of [...row.allowed, ...row.forbidden]) {
        const status = await call(apis[role], row, ctx);
        const isAllowed = row.allowed.includes(role);
        if (isAllowed) {
          if (status === 401 || status === 403) bad.push(`${role}: esperado permitido, recibio ${status}`);
          else if (row.method !== 'GET' && status >= 200 && status < 300) bad.push(`${role}: la escritura de prueba se ejecuto (${status}); revisar el ledger`);
          else if (status >= 500) bad.push(`${role}: 5xx (${status}) con entrada invalida`);
        } else if (status !== 403) {
          bad.push(`${role}: esperado 403, recibio ${status}`);
        }
      }
      expect(bad, `${row.id} ${row.method} desvios de RBAC`).toEqual([]);
    });
  }
});

test.describe('RBAC: casos especiales', () => {
  test('RBAC-X01 [S1] admin invita owner -> 403; owner invita owner NO se ejecuta aqui', async () => {
    const body = { email: e2eEmail('rbac-owner'), fullName: '[E2E] rbac no-crear', role: 'owner' };
    const res = await apis.admin.post('/app/equipo/api/invitations', { data: body });
    expect(res.status(), 'admin -> invitar owner').toBe(403);
    for (const role of ['operator', 'consulta', 'puerta', 'protocolo', 'biblioteca'] as Role[]) {
      const r = await apis[role].post('/app/equipo/api/invitations', { data: body });
      expect(r.status(), `${role} -> invitar`).toBe(403);
    }
  });

  test('RBAC-X02 [S0] buscador global: protocolo/biblioteca no obtienen personas del padron', async () => {
    const q = encodeURIComponent(ctx.visitorCode);
    const own = await jsonOf<{ users: unknown[] }>(await apis.owner.get(`/app/api/search?q=${q}`));
    expect(own.users.length, 'control: owner si encuentra a la persona [E2E]').toBeGreaterThan(0);
    const bad: string[] = [];
    for (const role of ['protocolo', 'biblioteca'] as Role[]) {
      const res = await apis[role].get(`/app/api/search?q=${q}`);
      if (res.status() === 403) continue; // tambien valido
      const b = await jsonOf<{ users: unknown[]; activities: unknown[] }>(res);
      if ((b.users ?? []).length > 0) bad.push(`${role}: /app/api/search devuelve ${(b.users ?? []).length} persona(s) del padron`);
    }
    expect(bad, 'H2 en el buscador global (palette Ctrl/Cmd+K)').toEqual([]);
  });

  test('RBAC-X03 [S3] H6: puerta y /app/historial (UI redirige; API?)', async ({}, testInfo) => {
    const audit = await apis.puerta.get('/app/historial/api/audit?limit=1');
    const team = await apis.puerta.get('/app/equipo/api/activity');
    testInfo.annotations.push({ type: 'H6', description: `puerta GET /historial/api/audit=${audit.status()}; GET /equipo/api/activity=${team.status()}; la UI /app/historial redirige a /app/puerta` });
    // Hallazgo documentado: la API permite a 'puerta' leer auditoria aunque la UI lo confine. Decision de producto.
    expect([200, 403]).toContain(audit.status());
  });

  test('RBAC-X04 [S0] sin sesion: ningun endpoint de datos responde 200', { tag: '@smoke' }, async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL: baseURL!, storageState: { cookies: [], origins: [] } });
    const paths = ['/app/check-in/api/visitors?q=abc', '/app/check-in/api/recent', '/app/api/search?q=abc', '/app/usuarios/api/export', '/app/equipo/api/team', '/app/historial/api/audit'];
    const bad: string[] = [];
    for (const p of paths) {
      const res = await anon.get(p, { maxRedirects: 0 });
      if (res.status() === 200) bad.push(`${p} -> 200 sin sesion`);
      else expect([307, 308, 401, 403], `${p} sin sesion`).toContain(res.status());
    }
    await anon.dispose();
    expect(bad).toEqual([]);
  });
});
