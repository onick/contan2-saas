import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getAttendanceView } from './attendance';

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
    path.includes('/attendance') ? { items, total: 510, limit: 100, offset: 0 } : METRICS) as typeof apiGet);
}

describe('getAttendanceView', () => {
  it('combina tabla (/attendance) + tasa real (/dashboard/metrics)', async () => {
    mockBoth([base]);
    const v = (await getAttendanceView())!;
    expect(v.total).toBe(510); // real (attendance.total)
    expect(v.tasaPct).toBe(78); // 390/500 (metrics)
    expect(v.noShowPct).toBe(22);
    expect(v.records[0]!.status).toBe('presente');
  });

  it('asistencia ANÓNIMA no rompe → "Anónimo" / "—"', async () => {
    mockBoth([{ ...base, anonymous: true, userCode: null, firstName: null, lastName: null }]);
    const r = (await getAttendanceView())!.records[0]!;
    expect(r.name).toBe('Anónimo');
    expect(r.code).toBe('—');
  });

  it('devuelve null si la API falla → la página cae a demo', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getAttendanceView()).toBeNull();
  });
});
