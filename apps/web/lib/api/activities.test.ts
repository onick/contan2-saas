import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getActivitiesView } from './activities';

afterEach(() => vi.clearAllMocks());

const item = (over: Record<string, unknown> = {}) => ({
  id: 'congos',
  name: 'Los Congos de Villa Mella',
  type: 'Concierto',
  location: 'CCB',
  date: '2026-05-12T00:00:00.000Z',
  capacity: 250,
  enrolledCount: 219,
  status: 'finalizada',
  category: 'Concierto',
  ...over,
});

describe('getActivitiesView', () => {
  it('mapea la tabla + deriva KPIs/conteos (total real, resto sobre el set)', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        item(),
        item({ id: 'a2', name: 'Cine Foro', status: 'activa', capacity: 100, enrolledCount: 50, category: null }),
        item({ id: 'a3', name: 'Taller', status: 'cancelada', capacity: 10, enrolledCount: 1 }),
      ],
      total: 7, // real (puede ser mayor que items)
      limit: 100,
      offset: 0,
    });
    const v = (await getActivitiesView())!;
    expect(v.total).toBe(7); // real
    expect(v.activas).toBe(1);
    expect(v.finalizadas).toBe(1);
    expect(v.canceladas).toBe(1);
    // ocupación promedio sobre el set: (88 + 50 + 10)/3 = 49.33 → 49
    expect(v.avgOccupancyPct).toBe(49);
    const a = v.activities[0]!;
    expect(a.title).toBe('Los Congos de Villa Mella');
    expect(a.statusLabel).toBe('Finalizada');
    expect(v.activities[1]!.category).toBe('Concierto'); // sin categoría → cae al TIPO (fix: un Concierto no es 'Otro')
  });

  it('mapea la portada: imageUrl real → imageUrl; ausente → null', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        item({ id: 'con-portada', imageUrl: '/uploads/v2-activity-x.webp' }),
        item({ id: 'sin-portada' }), // sin imageUrl
      ],
      total: 2, limit: 100, offset: 0,
    });
    const v = (await getActivitiesView())!;
    expect(v.activities[0]!.imageUrl).toBe('/uploads/v2-activity-x.webp');
    expect(v.activities[1]!.imageUrl).toBe(null);
  });

  it('devuelve null si la API falla → la página cae a demo (KPIs+pills+tabla)', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getActivitiesView()).toBeNull();
  });
});
