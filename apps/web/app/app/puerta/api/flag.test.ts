import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../../../lib/api/auth-proxy', () => ({ proxyAuth: vi.fn(async () => Response.json({ ok: true })) }));
vi.mock('../../../../lib/api/reports-proxy', () => ({ relayReport: vi.fn(async () => new Response('x')) }));

import { GET as salas } from './salas/route';
import { GET as stats } from './stats/route';
import { GET as bookings, POST as createBooking } from './bookings/route';
import { GET as exportXlsx } from './export/route';
import { POST as registrar } from './registrar/route';

afterEach(() => { vi.unstubAllEnvs(); });

const req = (u = 'http://x/a', init?: RequestInit) => new Request(u, init);

describe('BFF de Puerta respeta el flag', () => {
  it('flag apagado → 404 en todos los endpoints', async () => {
    vi.stubEnv('PUERTA_ENABLED', '0');
    const rs = await Promise.all([
      salas(), stats(req()), bookings(req()), exportXlsx(req()),
      createBooking(req('http://x/a', { method: 'POST', body: '{}' })),
      registrar(req('http://x/a', { method: 'POST', body: '{}' })),
    ]);
    expect(rs.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404]);
  });

  it('flag encendido → proxy normal', async () => {
    vi.stubEnv('PUERTA_ENABLED', '1');
    const r = await salas();
    expect(r.status).toBe(200);
  });
});
