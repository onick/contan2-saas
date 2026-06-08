import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'contan2_session' ? { value: 'tok123' } : undefined) }),
  headers: async () => new Map([['host', 'ccb.contan2.com'], ['x-forwarded-for', '1.2.3.4']]),
}));

import { proxyCreateActivityWithCover } from './activities-create';
import { POST as withCoverRoute } from '../../app/app/actividades/api/with-cover/route';

afterEach(() => vi.restoreAllMocks());

const boundary = '----wc123';
const mkReq = (ct: string | null) =>
  new Request('http://localhost/app/actividades/api/with-cover', {
    method: 'POST',
    ...(ct ? { headers: { 'content-type': ct } } : {}),
    body: `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nX\r\n--${boundary}--\r\n`,
  });

describe('proxyCreateActivityWithCover', () => {
  it('reenvía a /activities/with-cover preservando boundary + cookie + forwarded; relaya 201', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ activity: { id: 'A1' } }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFn);
    const ct = `multipart/form-data; boundary=${boundary}`;
    const res = await proxyCreateActivityWithCover(mkReq(ct));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/api/v2/activities/with-cover');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe(ct); // boundary preservado, NO base64
    expect(init.headers.cookie).toBe('contan2_session=tok123');
    expect(init.headers['x-forwarded-host']).toBe('ccb.contan2.com');
    expect(init.duplex).toBe('half');
    expect(res.status).toBe(201);
  });

  it('content-type no multipart → 400 sin tocar api-v2', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    expect((await proxyCreateActivityWithCover(mkReq('application/json'))).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fallo de red → 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect((await proxyCreateActivityWithCover(mkReq(`multipart/form-data; boundary=${boundary}`))).status).toBe(502);
  });

  it('relaya 413/415 del server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"big"}', { status: 413 })));
    expect((await proxyCreateActivityWithCover(mkReq(`multipart/form-data; boundary=${boundary}`))).status).toBe(413);
  });

  it('BFF route reenvía al proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"activity":{"id":"A1"}}', { status: 201 })));
    const res = await withCoverRoute(mkReq(`multipart/form-data; boundary=${boundary}`));
    expect(res.status).toBe(201);
  });
});
