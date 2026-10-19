import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'contan2_session' ? { value: 'tok123' } : undefined) }),
  headers: async () => new Map([['host', 'ccb.contan2.com'], ['x-forwarded-for', '1.2.3.4']]),
}));

import { GET } from '../../app/app/reportes/api/period/route';

afterEach(() => vi.restoreAllMocks());

describe('BFF /app/reportes/api/period (REP-A07)', () => {
  it('relaya el 400 de la API con su mensaje en español (no lo convierte en 500)', async () => {
    const msg = 'Rango demasiado amplio (máx 366 días). Acota el período.';
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } }));
    vi.stubGlobal('fetch', fn);
    const res = await GET(new Request('http://x/app/reportes/api/period?kind=pdf&from=2000-01-01&to=2099-12-31'));
    expect(fn.mock.calls[0]![0]).toBe('http://localhost:3001/api/v2/reports/period.pdf?from=2000-01-01&to=2099-12-31');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(msg);
  });
});
