import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ apiGet: vi.fn() }));
import { apiGet } from './client';
import { getUsersView } from './users';

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

describe('getUsersView', () => {
  it('mapea tabla con PII real + deriva KPIs/conteos (total real)', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        mkUser(), // activo, recurrente (4 visitas)
        mkUser({ id: 'u2', visitCount: 0, email: null }), // inactivo
      ],
      total: 9, // real (mayor que items)
      limit: 100,
      offset: 0,
    });
    const v = (await getUsersView())!;
    expect(v.total).toBe(9); // real
    const r = v.users[0]!;
    expect(r.name).toBe('Sofía Méndez');
    expect(r.email).toBe('sofia.real@ccb.do'); // PII real, no enmascarada
    expect(r.status).toBe('activo');
    expect(v.users[1]!.status).toBe('inactivo');
    expect(v.users[1]!.email).toBe('—');
    expect(v.activos).toBe(1);
    expect(v.inactivos).toBe(1);
    expect(v.recurrentes).toBe(1); // solo u1 (>1 visita)
    expect(v.retornoPct).toBe(50); // 1 de 2 en el set
  });

  it('devuelve null si la API falla → la página cae a demo', async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error('401'));
    expect(await getUsersView()).toBeNull();
  });
});
