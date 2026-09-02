// apps/web/lib/api/biblio.ts · fetchers server-side del Módulo Biblioteca
// (carga inicial con cookie reenviada); el cliente re-fetchea vía los BFF
// same-origin /app/biblioteca/api/*.

import {
  BiblioTitlesListResponseSchema, BiblioTitleDetailResponseSchema, BiblioSitesResponseSchema,
  BiblioFacetsResponseSchema, BiblioOverviewResponseSchema,
  BiblioReadersListResponseSchema, BiblioReadersStatsResponseSchema,
  type BiblioTitlesListResponse, type BiblioTitleDetailResponse, type BiblioSitesResponse,
  type BiblioFacetsResponse, type BiblioOverviewResponse,
  type BiblioReadersListResponse, type BiblioReadersStatsResponse,
} from '@contan2/contracts';
import { apiGet } from './client';

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
export async function getBiblioFacets(): Promise<BiblioFacetsResponse | null> {
  try { return await apiGet('/api/v2/biblio/facets', BiblioFacetsResponseSchema); }
  catch { return null; }
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
