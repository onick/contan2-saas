// app/api/contact/route.test.ts · proxy same-origin → api-v2 /api/v2/contact.
// Valida que reenvía body verbatim + forwarding headers, relaya status/body y
// devuelve 502 si api-v2 no responde. Sigue el patrón de uploads/[name]/route.test.ts.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { POST } from './route';

afterEach(() => vi.restoreAllMocks());

// El route usa next/headers (forwardingHeaders). Mockeamos el módulo para no
// depender del runtime de Next: devolvemos headers fijos.
vi.mock('../../../lib/api/forwarded', () => ({
  forwardingHeaders: async () => ({
    'x-forwarded-host': 'contan2.com',
    'x-forwarded-for': '203.0.113.7',
  }),
}));

// API_BASE_URL default = http://localhost:3001 (no está seteado en test).
function buildReq(body: unknown): Request {
  return new Request('https://contan2.com/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/contact (proxy → api-v2)', () => {
  it('200 de api-v2 → relay status + body al cliente', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchFn);

    const res = await POST(buildReq({ name: 'Ana', organization: 'X', email: 'a@b.co' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Reenvía a api-v2 con el path correcto y los headers de forwarding.
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:3001/api/v2/contact');
    expect(init!.method).toBe('POST');
    expect(init!.headers).toMatchObject({
      'content-type': 'application/json',
      'x-forwarded-host': 'contan2.com',
      'x-forwarded-for': '203.0.113.7',
    });
    // Body verbatim.
    expect(String(init!.body)).toBe(JSON.stringify({ name: 'Ana', organization: 'X', email: 'a@b.co' }));
  });

  it('429 de api-v2 → relay 429 + body de error al cliente', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"error":"Recibimos varias solicitudes..."}', { status: 429 }),
      ),
    );
    const res = await POST(buildReq({ name: 'Ana', organization: 'Teatro', email: 'a@b.co' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/varias solicitudes/i);
  });

  it('api-v2 caído (fetch reject) → 502 con mensaje útil', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await POST(buildReq({ name: 'Ana', organization: 'Teatro', email: 'a@b.co' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/no pudimos conectar/i);
  });
});
