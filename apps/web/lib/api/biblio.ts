// apps/web/lib/api/biblio.ts · fetchers server-side del Módulo Biblioteca
// (carga inicial con cookie reenviada); el cliente re-fetchea vía los BFF
// same-origin /app/biblioteca/api/*.

import {
  BiblioTitlesListResponseSchema, BiblioTitleDetailResponseSchema, BiblioSitesResponseSchema,
  BiblioFacetsResponseSchema,
  type BiblioTitlesListResponse, type BiblioTitleDetailResponse, type BiblioSitesResponse,
  type BiblioFacetsResponse,
} from '@contan2/contracts';
import { apiGet } from './client';

export async function getBiblioTitles(page = 1): Promise<BiblioTitlesListResponse | null> {
  try { return await apiGet(`/api/v2/biblio/titles?page=${page}`, BiblioTitlesListResponseSchema); }
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
