// apps/web/lib/api/biblio.ts · fetchers server-side del Módulo Biblioteca
// (carga inicial con cookie reenviada); el cliente re-fetchea vía los BFF
// same-origin /app/biblioteca/api/*.

import {
  BiblioTitlesListResponseSchema, BiblioTitleDetailResponseSchema, BiblioSitesResponseSchema,
  BiblioFacetsResponseSchema, BiblioOverviewResponseSchema,
  BiblioReadersListResponseSchema, BiblioReadersStatsResponseSchema,
  BiblioLoansListResponseSchema, BiblioCirculationSummarySchema,
  BiblioReservationsListResponseSchema, BiblioReservationsSummarySchema,
  BiblioInventoriesListResponseSchema,
  type BiblioTitlesListResponse, type BiblioTitleDetailResponse, type BiblioSitesResponse,
  type BiblioFacetsResponse, type BiblioOverviewResponse,
  type BiblioReadersListResponse, type BiblioReadersStatsResponse,
  type BiblioLoansListResponse, type BiblioCirculationSummary,
  type BiblioReservationsListResponse, type BiblioReservationsSummary,
  type BiblioInventoriesListResponse,
} from '@contan2/contracts';
import { apiGet, ApiError } from './client';

export async function getBiblioTitles(page = 1, q = ''): Promise<BiblioTitlesListResponse | null> {
  const p = new URLSearchParams({ page: String(page) });
  if (q.trim()) p.set('q', q.trim());
  try { return await apiGet(`/api/v2/biblio/titles?${p.toString()}`, BiblioTitlesListResponseSchema); }
  catch { return null; }
}
export async function getBiblioTitleDetail(id: string): Promise<BiblioTitleDetailResponse | null> {
  try { return await apiGet(`/api/v2/biblio/titles/${encodeURIComponent(id)}`, BiblioTitleDetailResponseSchema); }
  catch { return null; }
}
export async function getBiblioSites(): Promise<BiblioSitesResponse | null> {
  try { return await apiGet('/api/v2/biblio/sites', BiblioSitesResponseSchema); }
  catch { return null; }
}
// Resultado que distingue "sin permiso" (403) de "no disponible" (red / 5xx),
// para que la UI no diga "intenta de nuevo" a un rol que nunca podrá entrar.
export type BiblioLoad<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'forbidden' | 'unavailable' };

export async function getBiblioFacetsResult(): Promise<BiblioLoad<BiblioFacetsResponse>> {
  try { return { ok: true, data: await apiGet('/api/v2/biblio/facets', BiblioFacetsResponseSchema) }; }
  catch (e) {
    return { ok: false, reason: e instanceof ApiError && e.status === 403 ? 'forbidden' : 'unavailable' };
  }
}
export async function getBiblioFacets(): Promise<BiblioFacetsResponse | null> {
  const r = await getBiblioFacetsResult();
  return r.ok ? r.data : null;
}
export async function getBiblioOverview(): Promise<BiblioOverviewResponse | null> {
  try { return await apiGet('/api/v2/biblio/overview', BiblioOverviewResponseSchema); }
  catch { return null; }
}
export async function getBiblioReaders(page = 1): Promise<BiblioReadersListResponse | null> {
  try { return await apiGet(`/api/v2/biblio/readers?page=${page}`, BiblioReadersListResponseSchema); }
  catch { return null; }
}
export async function getBiblioReadersStats(): Promise<BiblioReadersStatsResponse | null> {
  try { return await apiGet('/api/v2/biblio/readers/stats', BiblioReadersStatsResponseSchema); }
  catch { return null; }
}
export async function getBiblioLoans(tab = 'activos'): Promise<BiblioLoansListResponse | null> {
  try { return await apiGet(`/api/v2/biblio/loans?tab=${encodeURIComponent(tab)}`, BiblioLoansListResponseSchema); }
  catch { return null; }
}
export async function getBiblioLoansSummary(): Promise<BiblioCirculationSummary | null> {
  try { return await apiGet('/api/v2/biblio/loans/summary', BiblioCirculationSummarySchema); }
  catch { return null; }
}
export async function getBiblioReservations(tab = 'activas'): Promise<BiblioReservationsListResponse | null> {
  try { return await apiGet(`/api/v2/biblio/reservations?tab=${encodeURIComponent(tab)}`, BiblioReservationsListResponseSchema); }
  catch { return null; }
}
export async function getBiblioReservationsSummary(): Promise<BiblioReservationsSummary | null> {
  try { return await apiGet('/api/v2/biblio/reservations/summary', BiblioReservationsSummarySchema); }
  catch { return null; }
}
export async function getBiblioInventories(): Promise<BiblioInventoriesListResponse | null> {
  try { return await apiGet('/api/v2/biblio/inventories', BiblioInventoriesListResponseSchema); }
  catch { return null; }
}
