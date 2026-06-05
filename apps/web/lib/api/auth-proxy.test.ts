// apps/web/lib/api/auth-proxy.test.ts · proxies de login/logout.
// Verifica relay de Set-Cookie, status, 502 si api-v2 cae, 303 del logout y
// que NUNCA se loguea PII (password/token).

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

import { proxyLogin, proxyLogout } from './auth-proxy';

// Response upstream con getSetCookie() (Headers nativo lo soporta en undici/node).
function upstream(status: number, body: unknown, setCookies: string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const c of setCookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
}

beforeEach(() => {
  state.cookieVal = undefined;
  state.hdrs.clear();
  vi.unstubAllGlobals();
});

describe('proxyLogin', () => {
  it('relaya status, body y Set-Cookie de api-v2', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => upstream(200, { ok: true }, ['contan2_session=abc; HttpOnly; Path=/; SameSite=Lax'])),
    );
    const res = await proxyLogin({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('contan2_session=abc');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('credencial inválida: relaya 401 sin cookie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => upstream(401, { error: 'Credenciales inválidas.' })));
    const res = await proxyLogin({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('api-v2 caída → 502 (no propaga el error crudo)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const res = await proxyLogin({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(502);
  });

  it('NO loguea el password ni el token', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
      vi.spyOn(console, m as 'log').mockImplementation(() => {}),
    );
    vi.stubGlobal('fetch', vi.fn(async () => upstream(200, { ok: true }, ['contan2_session=secret-tok'])));
    await proxyLogin({ email: 'a@b.com', password: 'super-secret-pass' });
    for (const s of spies) {
      for (const call of s.mock.calls) {
        const txt = call.map(String).join(' ');
        expect(txt).not.toContain('super-secret-pass');
        expect(txt).not.toContain('secret-tok');
      }
      s.mockRestore();
    }
  });
});

describe('proxyLogout', () => {
  it('303 → /login relayando la cookie de borrado de api-v2', async () => {
    state.cookieVal = 'tok';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => upstream(200, { ok: true }, ['contan2_session=; Path=/; Max-Age=0'])),
    );
    const res = await proxyLogout();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('sin cookie igual responde 303 → /login', async () => {
    state.cookieVal = undefined;
    vi.stubGlobal('fetch', vi.fn(async () => upstream(200, { ok: true }, ['contan2_session=; Max-Age=0'])));
    const res = await proxyLogout();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('api-v2 caída: limpia la cookie local igual y redirige', async () => {
    state.cookieVal = 'tok';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const res = await proxyLogout();
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
