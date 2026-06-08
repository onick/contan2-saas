import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getUsersPage } from './users';

afterEach(() => vi.clearAllMocks());

const mkUser = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  code: 'CCB-7K2P9Q',
  firstName: 'Sofía',
  lastName: 'Méndez',
  email: 'sofia.real@ccb.do',
  phone: '809-555-0001',
  visitCount: 4,
  createdAt: '2024-01-15T00:00:00.000Z',
  ...over,
});

describe('getUsersPage', () => {
  it('mapea filas con PII real + devuelve {users,total,limit,offset}', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [mkUser(), mkUser({ id: 'u2', visitCount: 0, email: null })],
      total: 105,
      limit: 20,
      offset: 0,
    });
    const v = (await getUsersPage({ limit: 20, offset: 0 }))!;
    expect(v.total).toBe(105); // total REAL del API (no del slice)
    expect(v.limit).toBe(20);
    expect(v.users[0]!.name).toBe('Sofía Méndez');
    expect(v.users[0]!.email).toBe('sofia.real@ccb.do'); // PII real
    expect(v.users[1]!.email).toBe('—');
  });

  it('arma el query string con limit/offset/q y SIN params vacíos', async () => {
    vi.mocked(apiGet).mockResolvedValue({ items: [], total: 0, limit: 50, offset: 50 });
    await getUsersPage({ limit: 50, offset: 50, q: 'ana' });
    expect(vi.mocked(apiGet).mock.calls[0]![0]).toBe('/api/v2/users?limit=50&offset=50&q=ana');
    vi.clearAllMocks();
    vi.mocked(apiGet).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    await getUsersPage({ limit: 20, offset: 0 }); // sin q
    expect(vi.mocked(apiGet).mock.calls[0]![0]).toBe('/api/v2/users?limit=20&offset=0');
  });

  it('devuelve null si la API falla → la página decide (Unavailable)', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getUsersPage({ limit: 20, offset: 0 })).toBeNull();
  });
});
