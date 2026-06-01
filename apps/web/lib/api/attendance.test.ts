import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getAttendance } from './attendance';

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

describe('getAttendance', () => {
  it('mapea presente (con check-in) → nombre + código + estado', async () => {
    vi.mocked(apiGet).mockResolvedValue({ items: [base], total: 1, limit: 20, offset: 0 });
    const r = (await getAttendance())![0]!;
    expect(r.name).toBe('Sofía Méndez');
    expect(r.code).toBe('CCB-7K2P9Q');
    expect(r.activity).toBe('Los Congos de Villa Mella');
    expect(r.status).toBe('presente');
    expect(r.statusLabel).toBe('Presente');
  });

  it('sin check-in → registrado', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [{ ...base, checkedInAt: null }],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const r = (await getAttendance())![0]!;
    expect(r.status).toBe('registrado');
    expect(r.statusLabel).toBe('Registrado');
  });

  it('asistencia ANÓNIMA (user/userCode null) no rompe → "Anónimo" / "—"', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [{ ...base, anonymous: true, userCode: null, firstName: null, lastName: null }],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const r = (await getAttendance())![0]!;
    expect(r.name).toBe('Anónimo');
    expect(r.code).toBe('—');
  });

  it('devuelve null si la API falla → fallback demo', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getAttendance()).toBeNull();
  });
});
