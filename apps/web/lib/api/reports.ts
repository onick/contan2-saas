// apps/web/lib/api/reports.ts · fetchers del dashboard ejecutivo de Reportes.
// Server-side (apiGet con cookie reenviada) para la carga inicial; el lado
// cliente pega al proxy same-origin /app/reportes/api/summary al cambiar filtros.

import { PeriodSummaryResponseSchema, type PeriodSummaryResponse } from '@contan2/contracts';
import { apiGet } from './client';

export function reportsQuery(from: string, to: string, types?: string[]): string {
  const p = new URLSearchParams({ from, to });
  if (types && types.length) p.set('types', types.join(','));
  return p.toString();
}

// Carga inicial (server component). null si la API cae → la página muestra Unavailable.
export async function getPeriodSummary(from: string, to: string, types?: string[]): Promise<PeriodSummaryResponse | null> {
  try {
    return await apiGet(`/api/v2/reports/period-summary?${reportsQuery(from, to, types)}`, PeriodSummaryResponseSchema);
  } catch {
    return null;
  }
}
