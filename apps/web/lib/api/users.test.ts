import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getUsers } from './users';

afterEach(() => vi.clearAllMocks());

const mkUser = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  code: 'CCB-7K2P9Q',
  firstName: 'Sofía',
  lastName: 'Méndez',
  email: 'sofia.real@ccb.do',
  phone: '809-555-0001',
  visitCount: 4,
  createdAt: '2024-01-15T00:00:00.000Z', // viejo → no "nuevo"
  ...over,
});

describe('getUsers', () => {
  it('mapea User → UserRow con PII real (nombre completo + email)', async () => {
    vi.mocked(apiGet).mockResolvedValue({ items: [mkUser()], total: 1, limit: 20, offset: 0 });
    const rows = await getUsers();
    expect(rows).not.toBeNull();
    const r = rows![0]!;
    expect(r.name).toBe('Sofía Méndez');
    expect(r.email).toBe('sofia.real@ccb.do'); // PII real, no enmascarada
    expect(r.code).toBe('CCB-7K2P9Q');
    expect(r.visits).toBe(4);
    expect(r.status).toBe('activo'); // viejo + con visitas
    expect(r.lastVisit).toBe('—'); // la API no provee última visita
  });

  it('deriva estado: sin visitas → inactivo; email null → "—"', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [mkUser({ visitCount: 0, email: null })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const r = (await getUsers())![0]!;
    expect(r.status).toBe('inactivo');
    expect(r.email).toBe('—');
  });

  it('devuelve null si la API falla → fallback demo', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getUsers()).toBeNull();
  });
});
