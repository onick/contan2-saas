import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del fetcher: el route handler solo orquesta status codes.
vi.mock('../../../lib/api/kiosko', () => ({ lookupKioskVisitor: vi.fn() }));
import { lookupKioskVisitor } from '../../../lib/api/kiosko';
import { GET } from './route';

const mock = vi.mocked(lookupKioskVisitor);
beforeEach(() => mock.mockReset());

const call = (q?: string) =>
  GET(new Request(`http://t.local/kiosko/lookup${q != null ? `?q=${encodeURIComponent(q)}` : ''}`));

describe('GET /kiosko/lookup (proxy read-only)', () => {
  it('200 { visitor } cuando lo encuentra', async () => {
    mock.mockResolvedValue({ visitor: { firstName: 'C', lastName: 'O', code: 'CCB-1', visitCount: 1, isNew: false, companionsChildren: 0 } });
    const res = await call('CCB-1');
    expect(res.status).toBe(200);
    expect((await res.json()).visitor.code).toBe('CCB-1');
  });

  it('200 { visitor: null } cuando no lo encuentra (sin ensuciar consola)', async () => {
    mock.mockResolvedValue(null);
    const res = await call('CCB-ZZZ999');
    expect(res.status).toBe(200);
    expect((await res.json()).visitor).toBeNull();
  });

  it('200 { matches } con homónimos por nombre (el visitante elige)', async () => {
    mock.mockResolvedValue({ matches: [
      { firstName: 'Ana', lastName: 'Pérez', code: 'CCB-AAA111', visitCount: 3, isNew: false, companionsChildren: 0 },
      { firstName: 'Ana', lastName: 'Pérez', code: 'CCB-BBB222', visitCount: 1, isNew: false, companionsChildren: 0 },
    ] });
    const res = await call('ana perez');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.visitor).toBeNull();
    expect(body.matches).toHaveLength(2);
  });

  it('400 cuando falta q', async () => {
    expect((await call()).status).toBe(400);
    expect(mock).not.toHaveBeenCalled();
  });

  it('502 cuando el fetcher tira (api caído / rate-limit)', async () => {
    mock.mockRejectedValueOnce(new Error('api down'));
    expect((await call('CCB-1')).status).toBe(502);
  });
});
