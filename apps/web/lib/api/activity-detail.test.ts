import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchActivityDetail } from './activity-detail';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const DETAIL = {
  id: 'A1', name: 'Concierto', type: 'concierto', location: 'Sala 2',
  date: '2030-06-10T19:00:00.000Z', endDate: null, capacity: 100, enrolledCount: 10,
  status: 'activa', description: 'D', category: 'M', imageUrl: null, imagePosY: null, audience: 'adultos',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('fetchActivityDetail', () => {
  it('200 válido → ok + detalle parseado same-origin', async () => {
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(DETAIL), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fn);
    const r = await fetchActivityDetail('A1');
    expect(fn.mock.calls[0]![0]).toBe('/app/actividades/api/A1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detail.description).toBe('D');
  });

  it('404 → error con mensaje claro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"x"}', { status: 404, headers: { 'content-type': 'application/json' } })));
    const r = await fetchActivityDetail('A1');
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.status).toBe(404); expect(r.error).toMatch(/ya no existe/i); }
  });

  it('respuesta inválida (no cumple schema) → error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"id":"A1"}', { status: 200, headers: { 'content-type': 'application/json' } })));
    const r = await fetchActivityDetail('A1');
    expect(r.ok).toBe(false);
  });

  it('fallo de red → error status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await fetchActivityDetail('A1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(0);
  });
});
