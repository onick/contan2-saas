import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock del cliente HTTP → no toca red ni next/headers.
vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getDashboardMetricCards } from './dashboard';

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
