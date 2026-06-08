import { describe, it, expect, afterEach, vi } from 'vitest';

// next/headers mockeado igual que en activities-create.test: cookies() trae la
// sesión de staff; headers() trae host del tenant + IP (lo que forwarded reenvía).
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'contan2_session' ? { value: 'tok123' } : undefined) }),
  headers: async () => new Map([['host', 'ccb.contan2.com'], ['x-forwarded-for', '1.2.3.4']]),
}));

import { proxyUpdateActivity, proxyUpdateStatus, proxyGetActivity } from './activities-edit';
import { PATCH as patchActivity, GET as getActivity } from '../../app/app/actividades/api/[id]/route';
import { PATCH as patchStatus } from '../../app/app/actividades/api/[id]/status/route';

afterEach(() => vi.restoreAllMocks());

describe('proxyGetActivity (GET /:id · detalle)', () => {
  it('reenvía GET con cookie + forwarded headers y relaya 200/body', async () => {
    const detail = { id: 'A1', name: 'X' };
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(detail), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFn);
    const res = await proxyGetActivity('A1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/api/v2/activities/A1');
    expect(init.method).toBe('GET');
    expect(init.headers.cookie).toBe('contan2_session=tok123');
    expect(init.headers['x-forwarded-host']).toBe('ccb.contan2.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(detail);
  });

  it('relaya 404 del server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x' }), { status: 404, headers: { 'content-type': 'application/json' } })));
    expect((await proxyGetActivity('A1')).status).toBe(404);
  });

  it('fallo de red → 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect((await proxyGetActivity('A1')).status).toBe(502);
  });

  it('BFF GET route reenvía al proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"id":"A1"}', { status: 200 })));
    const res = await getActivity(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'A1' }) });
    expect(res.status).toBe(200);
  });
});

describe('proxyUpdateActivity (PATCH /:id)', () => {
  it('reenvía PATCH con cookie + forwarded headers y relaya status/body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ activity: { id: 'A1' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFn);

    const res = await proxyUpdateActivity('A1', { name: 'Nuevo' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/api/v2/activities/A1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Nuevo' });
    expect(init.headers.cookie).toBe('contan2_session=tok123');
    expect(init.headers['x-forwarded-host']).toBe('ccb.contan2.com');
    expect(res.status).toBe(200);
  });

  it('relaya 409 del server (capacidad/transición) tal cual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'cap' }), { status: 409, headers: { 'content-type': 'application/json' } })));
    const res = await proxyUpdateActivity('A1', { capacity: 1 });
    expect(res.status).toBe(409);
  });

  it('fallo de red → 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await proxyUpdateActivity('A1', { name: 'x' });
    expect(res.status).toBe(502);
  });

  it('encodea el id en la URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFn);
    await proxyUpdateActivity('a/b', { name: 'x' });
    expect(fetchFn.mock.calls[0]![0]).toBe('http://localhost:3001/api/v2/activities/a%2Fb');
  });
});

describe('proxyUpdateStatus (PATCH /:id/status)', () => {
  it('reenvía PATCH a /status con el body { status }', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFn);
    await proxyUpdateStatus('A1', { status: 'finalizada' });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/api/v2/activities/A1/status');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'finalizada' });
  });
});

describe('BFF routes', () => {
  const mkReq = (body: string) => new Request('http://localhost/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body });

  it('[id] PATCH: JSON inválido → 400 sin tocar api-v2', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const res = await patchActivity(mkReq('{not json'), { params: Promise.resolve({ id: 'A1' }) });
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('[id] PATCH: JSON válido → reenvía a api-v2', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const res = await patchActivity(mkReq(JSON.stringify({ name: 'ok' })), { params: Promise.resolve({ id: 'A1' }) });
    expect(res.status).toBe(200);
  });

  it('[id]/status PATCH: JSON inválido → 400', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const res = await patchStatus(mkReq('nope'), { params: Promise.resolve({ id: 'A1' }) });
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
