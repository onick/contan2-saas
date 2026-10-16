// @vitest-environment node
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
    expect(body.error).toMatch(/inténtalo de nuevo/i);
  });

  describe('formulario nativo', () => {
    function formReq(fields: Record<string, string>, type: 'urlencoded' | 'multipart' = 'urlencoded'): Request {
      if (type === 'multipart') {
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);
        return new Request('https://contan2.com/api/contact', { method: 'POST', body: fd });
      }
      return new Request('https://contan2.com/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      });
    }
    const ok = { name: 'Ana Prueba', organization: 'Centro Prueba', email: 'ANA@example.com', message: 'Hola' };

    it('OK → 303 /contacto/enviado y reenvía JSON validado', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal('fetch', fetchFn);
      const res = await POST(formReq({ ...ok, fax: '' }));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/contacto/enviado');
      const [, init] = fetchFn.mock.calls[0]!;
      expect(init!.headers).toMatchObject({ 'content-type': 'application/json' });
      expect(JSON.parse(String(init!.body))).toMatchObject({ name: 'Ana Prueba', email: 'ana@example.com' });
    });

    it('multipart OK → 303 enviado', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })));
      const res = await POST(formReq(ok, 'multipart'));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/contacto/enviado');
    });

    it('honeypot lleno → éxito sin reenviar', async () => {
      const fetchFn = vi.fn();
      vi.stubGlobal('fetch', fetchFn);
      const res = await POST(formReq({ ...ok, fax: 'spam' }));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/contacto/enviado');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('inválido → 303 error (datos) sin reenviar', async () => {
      const fetchFn = vi.fn();
      vi.stubGlobal('fetch', fetchFn);
      const res = await POST(formReq({ ...ok, email: 'no-es-correo' }));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/contacto/error?motivo=datos');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('api-v2 caída → 303 error (servidor)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const res = await POST(formReq(ok));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/contacto/error?motivo=servidor');
    });

    it('api-v2 429 → 303 error (limite)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
      const res = await POST(formReq(ok));
      expect(res.headers.get('location')).toBe('/contacto/error?motivo=limite');
    });
  });
});
