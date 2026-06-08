import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getAttendancePage } from './attendance';

afterEach(() => vi.clearAllMocks());

const base = {
  id: 'r1',
  userCode: 'CCB-7K2P9Q',
  firstName: 'Sofía',
  lastName: 'Méndez',
  activityId: 'act1',
  activityName: 'Los Congos de Villa Mella',
  anonymous: false,
  checkedInAt: '2026-05-29T19:02:00.000Z',
  registeredAt: '2026-05-29T18:50:00.000Z',
};

const METRICS = {
  metrics: { totalUsers: 1842, totalActivities: 7, activeActivities: 2, totalAttendance: 500, checkedIn: 390 },
};

// Mock por path: /attendance → lista; /dashboard/metrics → métricas.
function mockBoth(items: unknown[]) {
  vi.mocked(apiGet).mockImplementation((async (path: string) =>
    path.includes('/attendance') ? { items, total: 510, limit: 20, offset: 0 } : METRICS) as typeof apiGet);
}

describe('getAttendancePage', () => {
  it('combina tabla (/attendance) + tasa real (/dashboard/metrics)', async () => {
    mockBoth([base]);
    const v = (await getAttendancePage({ limit: 20, offset: 0 }))!;
    expect(v.total).toBe(510); // real (attendance.total)
    expect(v.tasaPct).toBe(78); // 390/500 (metrics, global)
    expect(v.noShowPct).toBe(22);
    expect(v.records[0]!.status).toBe('presente');
  });

  it('arma el query string con filtros y SIN params vacíos', async () => {
    mockBoth([]);
    await getAttendancePage({
      limit: 50, offset: 50, q: 'congo', activityId: 'act1',
      dateFrom: '2026-05-01T00:00:00.000Z', dateTo: '2026-05-31T23:59:59.999Z',
    });
    const attCall = vi.mocked(apiGet).mock.calls.find((c) => String(c[0]).includes('/attendance'))!;
    expect(attCall[0]).toBe(
      '/api/v2/attendance?limit=50&offset=50&q=congo&activityId=act1&dateFrom=2026-05-01T00%3A00%3A00.000Z&dateTo=2026-05-31T23%3A59%3A59.999Z',
    );
  });

  it('asistencia ANÓNIMA no rompe → "Anónimo" / "—"', async () => {
    mockBoth([{ ...base, anonymous: true, userCode: null, firstName: null, lastName: null }]);
    const r = (await getAttendancePage({ limit: 20, offset: 0 }))!.records[0]!;
    expect(r.name).toBe('Anónimo');
    expect(r.code).toBe('—');
  });

  it('devuelve null si la API falla → la página decide (Unavailable)', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getAttendancePage({ limit: 20, offset: 0 })).toBeNull();
  });
});
