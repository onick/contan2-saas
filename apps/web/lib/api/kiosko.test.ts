import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del cliente server-only: apiGet stub + ApiError REAL (kiosko.ts hace
// `instanceof ApiError`, así que la clase debe ser la misma que importa el test).
vi.mock('./client', () => {
  class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
  }
  return { apiGet: vi.fn(), ApiError };
});

import { apiGet, ApiError } from './client';
import {
  toKioskActivity, toKioskVisitor, formatKioskDate, getKioskActivities, lookupKioskVisitor,
} from './kiosko';

const apiGetMock = vi.mocked(apiGet);
beforeEach(() => apiGetMock.mockReset());

const activity = (over: Record<string, unknown> = {}) => ({
  id: 'a1', name: 'Cine Foro', type: 'Cine', category: null, location: 'Sala',
  date: new Date().toISOString(), capacity: 80, enrolledCount: 10, imageUrl: '/x.jpg', imagePosY: null, ...over,
});

describe('mappers', () => {
  it('toKioskActivity mapea campos y formatea la fecha; category cae a type', () => {
    const k = toKioskActivity(activity());
    expect(k).toMatchObject({ id: 'a1', name: 'Cine Foro', category: 'Cine', location: 'Sala', capacity: 80, enrolled: 10, imageUrl: '/x.jpg' });
    expect(k.date).toContain('·');
  });

  it('category usa la columna category cuando existe', () => {
    expect(toKioskActivity(activity({ category: 'Tertulia' })).category).toBe('Tertulia');
  });

  it('formatKioskDate: Hoy / Mañana / fecha con día', () => {
    const now = new Date(2026, 5, 2, 12, 0, 0);
    expect(formatKioskDate(new Date(2026, 5, 2, 19, 0, 0).toISOString(), now)).toMatch(/^Hoy · /);
    expect(formatKioskDate(new Date(2026, 5, 3, 18, 30, 0).toISOString(), now)).toMatch(/^Mañana · /);
    expect(formatKioskDate(new Date(2026, 5, 12, 20, 0, 0).toISOString(), now)).not.toMatch(/^(Hoy|Mañana)/);
  });

  it('toKioskVisitor: isNew=false, companionsChildren=0', () => {
    expect(toKioskVisitor({ firstName: 'C', lastName: 'O', code: 'CCB-1', visitCount: 3 }))
      .toEqual({ firstName: 'C', lastName: 'O', code: 'CCB-1', visitCount: 3, isNew: false, companionsChildren: 0 });
  });
});

describe('getKioskActivities (fallback)', () => {
  it('mapea cuando apiGet resuelve', async () => {
    apiGetMock.mockResolvedValue({ activities: [activity()], total: 1 });
    expect(await getKioskActivities()).toHaveLength(1);
  });
  it('devuelve null cuando apiGet tira (→ el wrapper cae a demo)', async () => {
    apiGetMock.mockRejectedValueOnce(new Error('api down'));
    expect(await getKioskActivities()).toBeNull();
  });
});

describe('lookupKioskVisitor', () => {
  it('mapea el visitante en éxito ({ visitor })', async () => {
    apiGetMock.mockResolvedValue({ visitor: { firstName: 'C', lastName: 'O', code: 'CCB-1', visitCount: 2 } });
    const out = await lookupKioskVisitor('CCB-1');
    expect(out && 'visitor' in out ? out.visitor.code : null).toBe('CCB-1');
  });
  it('homónimos por nombre → { matches } mapeados', async () => {
    apiGetMock.mockResolvedValue({ matches: [
      { firstName: 'Ana', lastName: 'Pérez', code: 'CCB-AAA111', visitCount: 3 },
      { firstName: 'Ana', lastName: 'Pérez', code: 'CCB-BBB222', visitCount: 1 },
    ] });
    const out = await lookupKioskVisitor('ana perez');
    expect(out && 'matches' in out ? out.matches.map((m) => m.code) : []).toEqual(['CCB-AAA111', 'CCB-BBB222']);
  });
  it('null en 404 (no encontrado); 400 → needsFullName con el hint del server', async () => {
    apiGetMock.mockRejectedValueOnce(new ApiError(404, 'nf'));
    expect(await lookupKioskVisitor('CCB-ZZZ999')).toBeNull();
    apiGetMock.mockRejectedValueOnce(new ApiError(400, 'Escribe tu nombre y apellido, o usa tu código (CCB-XXXXXX) o correo.'));
    const out = await lookupKioskVisitor('Marcelino');
    expect(out).toEqual({ needsFullName: true, hint: 'Escribe tu nombre y apellido, o usa tu código (CCB-XXXXXX) o correo.' });
  });
  it('re-lanza en 5xx (error real → no se cae a demo)', async () => {
    apiGetMock.mockRejectedValueOnce(new ApiError(502, 'down'));
    await expect(lookupKioskVisitor('CCB-1')).rejects.toBeInstanceOf(ApiError);
  });
});
