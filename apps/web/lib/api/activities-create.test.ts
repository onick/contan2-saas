import { describe, it, expect, afterEach, vi } from 'vitest';

// next/headers mockeado: cookies() trae la sesión de staff; headers() trae host
// del tenant + IP del cliente (lo que forwarded.ts reenvía).
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'contan2_session' ? { value: 'tok123' } : undefined) }),
  headers: async () => new Map([['host', 'ccb.contan2.com'], ['x-forwarded-for', '1.2.3.4']]),
}));

import { proxyCreateActivity, proxyUploadCover } from './activities-create';
import { POST } from '../../app/app/actividades/api/route';

afterEach(() => vi.restoreAllMocks());

describe('proxyUploadCover (multipart)', () => {
  const boundary = '----testBoundary123';
  const ct = `multipart/form-data; boundary=${boundary}`;
  const mkReq = (contentType: string | null) =>
    new Request('http://localhost/app/actividades/api/A1/cover', {
      method: 'POST',
      ...(contentType ? { headers: { 'content-type': contentType } } : {}),
      body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="c.png"\r\nContent-Type: image/png\r\n\r\nXXXX\r\n--${boundary}--\r\n`,
    });

  it('preserva el boundary (reenvía el content-type entrante), cookie y forwarded headers', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ activity: { id: 'A1' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFn);

    const res = await proxyUploadCover('A1', mkReq(ct));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/api/v2/activities/A1/cover');
    expect(init.method).toBe('POST');
    // content-type reenviado TAL CUAL → conserva el boundary (no hardcodeado).
    expect(init.headers['content-type']).toBe(ct);
    expect(init.headers.cookie).toBe('contan2_session=tok123');
    expect(init.headers['x-forwarded-host']).toBe('ccb.contan2.com');
    expect(init.headers['x-forwarded-for']).toBe('1.2.3.4');
    expect(init.duplex).toBe('half');
    expect(res.status).toBe(200);
  });

  it('content-type que no es multipart → 400 sin tocar api-v2', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const res = await proxyUploadCover('A1', mkReq('application/json'));
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fallo de red → 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await proxyUploadCover('A1', mkReq(ct));
    expect(res.status).toBe(502);
  });
});

describe('proxyCreateActivity', () => {
  it('reenvía cookie + forwarded headers a api-v2 y relaya status/body (201)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ activity: { id: 'a1' } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchFn);

    const res = await proxyCreateActivity({ name: 'X', capacity: 10 });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/api/v2/activities');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      cookie: 'contan2_session=tok123',
      'x-forwarded-host': 'ccb.contan2.com',
      'x-forwarded-for': '1.2.3.4',
    });
    expect(JSON.parse(init.body as string)).toEqual({ name: 'X', capacity: 10 });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ activity: { id: 'a1' } });
  });

  it('relaya un error del upstream tal cual (403)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'No tenés permiso' }), { status: 403, headers: { 'content-type': 'application/json' } }),
    ));
    const res = await proxyCreateActivity({});
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'No tenés permiso' });
  });

  it('fallo de red hacia api-v2 → 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await proxyCreateActivity({});
    expect(res.status).toBe(502);
  });
});

describe('POST /app/actividades/api (route handler)', () => {
  it('JSON inválido → 400 sin tocar api-v2', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const req = new Request('http://localhost/app/actividades/api', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'no-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('JSON válido → delega en el proxy y relaya el status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ activity: { id: 'a2' } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    ));
    const req = new Request('http://localhost/app/actividades/api', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Y' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});
