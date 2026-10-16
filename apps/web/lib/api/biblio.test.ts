import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiGet = vi.fn();
vi.mock('./client', () => {
  class ApiError extends Error {
    constructor(public readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
  }
  return { apiGet: (...a: unknown[]) => apiGet(...a), ApiError };
});

import { ApiError } from './client';
import { getBiblioFacetsResult, getBiblioFacets } from './biblio';

beforeEach(() => apiGet.mockReset());

describe('getBiblioFacetsResult · BIB-09a', () => {
  it('403 -> forbidden (sin permiso)', async () => {
    apiGet.mockRejectedValueOnce(new ApiError(403, 'No tienes permiso'));
    expect(await getBiblioFacetsResult()).toEqual({ ok: false, reason: 'forbidden' });
    apiGet.mockRejectedValueOnce(new ApiError(403, 'No tienes permiso'));
    expect(await getBiblioFacets()).toBeNull();
  });
  it('error de red o 5xx -> unavailable', async () => {
    apiGet.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await getBiblioFacetsResult()).toEqual({ ok: false, reason: 'unavailable' });
    apiGet.mockRejectedValueOnce(new ApiError(502, 'Bad gateway'));
    expect(await getBiblioFacetsResult()).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('200 -> ok con datos', async () => {
    apiGet.mockResolvedValue({ total: 1 });
    expect(await getBiblioFacetsResult()).toEqual({ ok: true, data: { total: 1 } });
  });
});
