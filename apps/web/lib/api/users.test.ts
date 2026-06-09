import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getUsersPage, getUsersFacets } from './users';

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
  lastVisitAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  credentialSentAt: '2024-02-01T00:00:00.000Z',
  status: 'active',
  ...over,
});

describe('getUsersPage', () => {
  it('mapea filas con PII real + última visita + credencial + estado', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        mkUser(),
        mkUser({ id: 'u2', visitCount: 0, email: null, lastVisitAt: null, credentialSentAt: null, status: 'dormant' }),
        mkUser({ id: 'u3', status: null, credentialSentAt: null }), // zona intermedia + credencial pendiente
      ],
      total: 105, limit: 20, offset: 0,
    });
    const v = (await getUsersPage({ limit: 20, offset: 0 }))!;
    expect(v.total).toBe(105); // total REAL del API (no del slice)
    expect(v.users[0]!.name).toBe('Sofía Méndez');
    expect(v.users[0]!.email).toBe('sofia.real@ccb.do'); // PII real
    expect(v.users[0]!.lastVisit).toMatch(/hace/);        // última visita real
    expect(v.users[0]!.credentialLabel).toBe('Enviada');
    expect(v.users[0]!.statusLabel).toBe('Activo');
    // u2: sin email + nunca visitó + dormant
    expect(v.users[1]!.email).toBe('—');
    expect(v.users[1]!.lastVisit).toBe('Nunca');
    expect(v.users[1]!.credentialLabel).toBe('Sin email');
    expect(v.users[1]!.statusLabel).toBe('Dormido');
    // u3: zona intermedia → sin etiqueta; con email y sin credencial → Pendiente
    expect(v.users[2]!.statusLabel).toBe('');
    expect(v.users[2]!.credentialLabel).toBe('Pendiente');
  });

  it('arma el query string con limit/offset/q/cohort y SIN params vacíos ni cohort=all', async () => {
    vi.mocked(apiGet).mockResolvedValue({ items: [], total: 0, limit: 50, offset: 50 });
    await getUsersPage({ limit: 50, offset: 50, q: 'ana', cohort: 'frequent' });
    expect(vi.mocked(apiGet).mock.calls[0]![0]).toBe('/api/v2/users?limit=50&offset=50&q=ana&cohort=frequent');
    vi.clearAllMocks();
    vi.mocked(apiGet).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    await getUsersPage({ limit: 20, offset: 0, cohort: 'all' }); // all → omitido
    expect(vi.mocked(apiGet).mock.calls[0]![0]).toBe('/api/v2/users?limit=20&offset=0');
  });

  it('devuelve null si la API falla → la página decide (Unavailable)', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getUsersPage({ limit: 20, offset: 0 })).toBeNull();
  });
});

describe('getUsersFacets', () => {
  it('pega a /users/facets con q y devuelve los conteos', async () => {
    const counts = { all: 10, frequent: 3, new7d: 2, noEmail: 1, noCredential: 4, active: 5, dormant: 2 };
    vi.mocked(apiGet).mockResolvedValue({ counts });
    expect(await getUsersFacets('ana')).toEqual(counts);
    expect(vi.mocked(apiGet).mock.calls[0]![0]).toBe('/api/v2/users/facets?q=ana');
  });

  it('null si falla (las pills siguen navegables sin número)', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('502'));
    expect(await getUsersFacets()).toBeNull();
  });
});
