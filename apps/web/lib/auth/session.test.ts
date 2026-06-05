// apps/web/lib/auth/session.test.ts · gate server-side + saneo de `next`.
// Mockea next/headers (cookie + host) y la fetch global (auth/me + org/branding).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  cookieVal: undefined as string | undefined,
  hdrs: new Map<string, string>(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (_k: string) => (state.cookieVal !== undefined ? { value: state.cookieVal } : undefined),
  }),
  headers: async () => ({ get: (k: string) => state.hdrs.get(k.toLowerCase()) ?? null }),
}));

import { resolveAdminGate, sanitizeNext } from './session';

const STAFF = {
  id: 's1',
  organizationId: 'org-ccb',
  email: 'admin@ccb.do',
  fullName: 'Admin CCB',
  status: 'active',
  role: 'admin',
  mustChangePassword: false,
  mfaEnabled: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const ORG = {
  id: 'org-ccb',
  slug: 'ccb',
  name: 'Centro Cultural Banreservas',
  logoUrl: null,
  emailLogoUrl: null,
  primaryColor: '#e65100',
  secondaryColor: '#ff6f00',
  sidebarTheme: 'brand',
  status: 'active',
};

const resp = (status: number, json: unknown): Response =>
  ({ status, ok: status >= 200 && status < 300, json: async () => json }) as Response;

// Stub de fetch por URL: me=/auth/me, br=/org/branding.
function stubFetch(me: Response | Error, br: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      const pick = u.includes('/auth/me') ? me : br;
      if (pick instanceof Error) throw pick;
      return pick;
    }),
  );
}

beforeEach(() => {
  state.cookieVal = undefined;
  state.hdrs.clear();
  vi.unstubAllGlobals();
});

describe('resolveAdminGate', () => {
  it('sin cookie → unauthenticated (no llama a api-v2)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await resolveAdminGate()).status).toBe('unauthenticated');
    expect(f).not.toHaveBeenCalled();
  });

  it('sesión válida + tenant correcto → ok con staff y branding', async () => {
    state.cookieVal = 'tok';
    stubFetch(resp(200, { staff: STAFF, sessionId: 'sess1' }), resp(200, { organization: ORG }));
    const g = await resolveAdminGate();
    expect(g.status).toBe('ok');
    if (g.status === 'ok') {
      expect(g.staff.email).toBe('admin@ccb.do');
      expect(g.branding.slug).toBe('ccb');
    }
  });

  it('operator también entra (el gate no filtra por rol)', async () => {
    state.cookieVal = 'tok';
    stubFetch(
      resp(200, { staff: { ...STAFF, role: 'operator' }, sessionId: 's' }),
      resp(200, { organization: ORG }),
    );
    const g = await resolveAdminGate();
    expect(g.status).toBe('ok');
    if (g.status === 'ok') expect(g.staff.role).toBe('operator');
  });

  it('401 en branding → unauthenticated', async () => {
    state.cookieVal = 'tok';
    stubFetch(resp(401, {}), resp(401, {}));
    expect((await resolveAdminGate()).status).toBe('unauthenticated');
  });

  it('403 en branding → cross-tenant', async () => {
    state.cookieVal = 'tok';
    stubFetch(resp(200, { staff: STAFF, sessionId: 's' }), resp(403, {}));
    expect((await resolveAdminGate()).status).toBe('cross-tenant');
  });

  it('404 en branding → unknown-host', async () => {
    state.cookieVal = 'tok';
    stubFetch(resp(200, { staff: STAFF, sessionId: 's' }), resp(404, {}));
    expect((await resolveAdminGate()).status).toBe('unknown-host');
  });

  it('api-v2 caída (fetch throw) → unavailable (jamás demo)', async () => {
    state.cookieVal = 'tok';
    stubFetch(new Error('ECONNREFUSED'), new Error('ECONNREFUSED'));
    expect((await resolveAdminGate()).status).toBe('unavailable');
  });

  it('5xx → unavailable', async () => {
    state.cookieVal = 'tok';
    stubFetch(resp(503, {}), resp(503, {}));
    expect((await resolveAdminGate()).status).toBe('unavailable');
  });
});

describe('sanitizeNext', () => {
  it('rutas válidas bajo /app se preservan', () => {
    expect(sanitizeNext('/app')).toBe('/app');
    expect(sanitizeNext('/app/usuarios')).toBe('/app/usuarios');
    expect(sanitizeNext('/app/actividades?x=1')).toBe('/app/actividades?x=1');
    expect(sanitizeNext(encodeURIComponent('/app/registros'))).toBe('/app/registros');
  });

  it('rechaza absolutas, protocol-relative, traversal y fuera de /app → /app', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/app');
    expect(sanitizeNext('//evil.com')).toBe('/app');
    expect(sanitizeNext('/\\evil.com')).toBe('/app');
    expect(sanitizeNext('/app/../admin')).toBe('/app');
    expect(sanitizeNext('/kiosko')).toBe('/app');
    expect(sanitizeNext('/appfoo')).toBe('/app'); // no es límite /app
    expect(sanitizeNext('javascript:alert(1)')).toBe('/app');
    expect(sanitizeNext(null)).toBe('/app');
    expect(sanitizeNext(undefined)).toBe('/app');
    expect(sanitizeNext('')).toBe('/app');
  });
});
