import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock del cliente HTTP → no toca red ni next/headers.
vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getDashboardMetricCards, getRecentVisitors } from './dashboard';

afterEach(() => vi.clearAllMocks());

describe('getDashboardMetricCards', () => {
  it('mapea las métricas reales a 4 tarjetas (formateadas, sin tendencias)', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      metrics: { totalUsers: 1842, totalActivities: 7, activeActivities: 2, totalAttendance: 510, checkedIn: 48 },
    });
    const cards = await getDashboardMetricCards();
    expect(cards).not.toBeNull();
    expect(cards!.map((c) => c.label)).toEqual(['Asistencias', 'Visitantes', 'Actividades activas', 'Check-ins']);
    expect(cards!.find((c) => c.label === 'Asistencias')!.value).toBe('510');
    expect(cards!.find((c) => c.label === 'Visitantes')!.value).toBe('1,842'); // toLocaleString
    expect(cards!.every((c) => c.trend === undefined)).toBe(true);
  });

  it('devuelve null si la API falla → la página cae a demoData', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getDashboardMetricCards()).toBeNull();
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
