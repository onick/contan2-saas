// apps/web/lib/api/forwarded.test.ts · reenvío de x-forwarded-for / -host.
// Mockea next/headers (server-only) y la fetch global para inspeccionar lo que
// los proxies mandan a api-v2.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Estado mutable compartido con el mock de next/headers (hoisted antes del mock).
const state = vi.hoisted(() => ({
  hdrs: new Map<string, string>(),
  cookieVal: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => state.hdrs.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ get: (_k: string) => (state.cookieVal !== undefined ? { value: state.cookieVal } : undefined) }),
}));

import { forwardingHeaders } from './forwarded';
import { proxyToApiV2 } from './scanner';

beforeEach(() => {
  state.hdrs.clear();
  state.cookieVal = undefined;
  vi.unstubAllGlobals();
});

describe('forwardingHeaders', () => {
  it('reenvía host + x-forwarded-for cuando entran', async () => {
    state.hdrs.set('host', 'ccb.contan2.com');
    state.hdrs.set('x-forwarded-for', '203.0.113.7');
    expect(await forwardingHeaders()).toEqual({
      'x-forwarded-host': 'ccb.contan2.com',
      'x-forwarded-for': '203.0.113.7',
    });
  });

  it('NO inventa x-forwarded-for si no entra (host sí)', async () => {
    state.hdrs.set('host', 'ccb.contan2.com');
    const f = await forwardingHeaders();
    expect(f['x-forwarded-host']).toBe('ccb.contan2.com');
    expect('x-forwarded-for' in f).toBe(false);
  });

  it('preserva la cadena entrante VERBATIM (client, proxy)', async () => {
    state.hdrs.set('x-forwarded-for', '203.0.113.7, 10.0.0.1');
    expect((await forwardingHeaders())['x-forwarded-for']).toBe('203.0.113.7, 10.0.0.1');
  });
});

describe('proxyToApiV2 · reenvía XFF sin romper cookie/host/Set-Cookie', () => {
  const fakeUpstream = (setCookie?: string) => ({
    status: 200,
    async text() { return JSON.stringify({ ok: true }); },
    headers: {
      get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null),
      getSetCookie: () => (setCookie ? [setCookie] : []),
    },
  });

  it('incluye x-forwarded-for + host y relaya status/Set-Cookie', async () => {
    state.hdrs.set('host', 'ccb.contan2.com');
    state.hdrs.set('x-forwarded-for', '203.0.113.7');
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { captured = init; return fakeUpstream('scanner_session=abc; Path=/; HttpOnly'); }));

    const res = await proxyToApiV2({ method: 'GET', path: '/api/v2/scanner/me' });
    const h = captured!.headers as Record<string, string>;
    expect(res.status).toBe(200);
    expect(h['x-forwarded-for']).toBe('203.0.113.7');
    expect(h['x-forwarded-host']).toBe('ccb.contan2.com');
    expect(res.headers.get('set-cookie')).toContain('scanner_session=abc'); // relay intacto
  });

  it('sin x-forwarded-for entrante → no lo manda (host sí)', async () => {
    state.hdrs.set('host', 'ccb.contan2.com');
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { captured = init; return fakeUpstream(); }));

    const res = await proxyToApiV2({ method: 'GET', path: '/api/v2/scanner/me' });
    const h = captured!.headers as Record<string, string>;
    expect('x-forwarded-for' in h).toBe(false);
    expect(h['x-forwarded-host']).toBe('ccb.contan2.com');
    expect(res.status).toBe(200);
  });

  it('forwardScannerCookie: reenvía la cookie scanner_session junto al XFF', async () => {
    state.hdrs.set('host', 'ccb.contan2.com');
    state.hdrs.set('x-forwarded-for', '203.0.113.7');
    state.cookieVal = 'signed-token';
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { captured = init; return fakeUpstream(); }));

    await proxyToApiV2({ method: 'GET', path: '/api/v2/scanner/me', forwardScannerCookie: true });
    const h = captured!.headers as Record<string, string>;
    expect(h.cookie).toBe('scanner_session=signed-token');
    expect(h['x-forwarded-for']).toBe('203.0.113.7');
  });
});
