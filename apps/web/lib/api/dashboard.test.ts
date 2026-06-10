import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock del cliente HTTP → no toca red ni next/headers.
vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getDashboardOverview, getRecentVisitors } from './dashboard';

afterEach(() => vi.clearAllMocks());

describe('getDashboardOverview', () => {
  it('pasa el period a la API y devuelve el overview tal cual', async () => {
    const overview = { period: '7d', series: [], attendance: { current: 3, previous: 1, deltaPct: 200 } };
    vi.mocked(apiGet).mockResolvedValue(overview);
    const r = await getDashboardOverview('7d');
    expect(vi.mocked(apiGet).mock.calls[0]![0]).toBe('/api/v2/dashboard/overview?period=7d');
    expect(r).toBe(overview);
  });

  it('devuelve null si la API falla → indisponibilidad honesta (nunca demo)', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getDashboardOverview('30d')).toBeNull();
  });
});

describe('getRecentVisitors', () => {
  it('mapea User → RecentVisitor (recientes del endpoint /users)', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        { id: 'u1', code: 'CCB-7K2P9Q', firstName: 'Sofía', lastName: 'Méndez', email: 'sofia.real@ccb.do', phone: null, visitCount: 2, createdAt: '2026-05-29T00:00:00.000Z' },
      ],
      total: 1,
      limit: 6,
      offset: 0,
    });
    const v = (await getRecentVisitors())![0]!;
    expect(v.name).toBe('Sofía Méndez');
    expect(v.code).toBe('CCB-7K2P9Q');
    expect(v.email).toBe('sofia.real@ccb.do');
    expect(v.visits).toBe(2);
  });

  it('devuelve null si la API falla → fallback demo', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getRecentVisitors()).toBeNull();
  });
});
