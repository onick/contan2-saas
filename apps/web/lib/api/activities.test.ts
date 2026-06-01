import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getActivities } from './activities';

afterEach(() => vi.clearAllMocks());

describe('getActivities', () => {
  it('mapea ActivityListItem → Activity (status, ocupación, registrados)', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        {
          id: 'congos',
          name: 'Los Congos de Villa Mella',
          type: 'Concierto',
          location: 'CCB',
          date: '2026-05-12T00:00:00.000Z',
          capacity: 250,
          enrolledCount: 219,
          status: 'finalizada',
          category: 'Concierto',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const acts = await getActivities();
    expect(acts).not.toBeNull();
    const a = acts![0]!;
    expect(a.title).toBe('Los Congos de Villa Mella');
    expect(a.status).toBe('done');
    expect(a.statusLabel).toBe('Finalizada');
    expect(a.registered).toBe(219);
    expect(a.occupancyPct).toBe(88); // 219/250
    expect(a.category).toBe('Concierto');
  });

  it('category null → "Otro"', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        { id: 'x', name: 'X', type: 'T', location: 'L', date: '2026-05-01T00:00:00.000Z', capacity: 10, enrolledCount: 1, status: 'activa', category: null },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const acts = await getActivities();
    const a = acts![0]!;
    expect(a.category).toBe('Otro');
    expect(a.status).toBe('live');
  });

  it('devuelve null si la API falla → fallback demo', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getActivities()).toBeNull();
  });
});
