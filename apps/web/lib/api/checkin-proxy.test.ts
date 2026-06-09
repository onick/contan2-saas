import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'contan2_session' ? { value: 'tok123' } : undefined) }),
  headers: async () => new Map([['host', 'ccb.contan2.com'], ['x-forwarded-for', '1.2.3.4']]),
}));

import { proxyCheckinMetrics, proxyCheckinActivities, proxyCheckinVisitors, proxyCheckin, proxyCheckinAnonymous } from './checkin-proxy';

afterEach(() => vi.restoreAllMocks());

describe('checkin-proxy', () => {
  it('metrics: GET con cookie + forwarded; relay 200', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('{"ok":1}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fn);
    const res = await proxyCheckinMetrics();
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/api/v2/checkin/metrics');
    expect(init.method).toBe('GET');
    expect(init.headers.cookie).toBe('contan2_session=tok123');
    expect(init.headers['x-forwarded-host']).toBe('ccb.contan2.com');
    expect(res.status).toBe(200);
  });

  it('visitors: preserva el query string', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fn);
    await proxyCheckinVisitors('?q=sof&limit=12');
    expect(fn.mock.calls[0]![0]).toBe('http://localhost:3001/api/v2/checkin/visitors?q=sof&limit=12');
  });

  it('checkin: POST con body JSON; relaya 201', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('{"code":"x"}', { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fn);
    const res = await proxyCheckin({ activityId: 'A1', visitor: { code: 'CCB-1' }, companionsChildren: 0 });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/api/v2/checkin');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ activityId: 'A1' });
    expect(res.status).toBe(201);
  });

  it('anonymous: reenvía Idempotency-Key SÓLO acá', async () => {
    const fn = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 201 })));
    vi.stubGlobal('fetch', fn);
    await proxyCheckinAnonymous({ activityId: 'A1' }, 'key-123');
    const init = fn.mock.calls[0]![1];
    expect(init.headers['idempotency-key']).toBe('key-123');
    // checkin (no anonymous) NUNCA manda idempotency-key
    fn.mockClear();
    await proxyCheckin({ activityId: 'A1', visitor: { code: 'x' }, companionsChildren: 0 });
    expect(fn.mock.calls[0]![1].headers['idempotency-key']).toBeUndefined();
  });

  it('sin Idempotency-Key (null) → no se manda el header', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fn);
    await proxyCheckinAnonymous({ activityId: 'A1' }, null);
    expect(fn.mock.calls[0]![1].headers['idempotency-key']).toBeUndefined();
  });

  it('API caída → 502 (estado honesto, nunca demo)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect((await proxyCheckinMetrics()).status).toBe(502);
    expect((await proxyCheckinActivities()).status).toBe(502);
  });
});
