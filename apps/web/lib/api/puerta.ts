// apps/web/lib/api/puerta.ts · fetcher server-side de los reportes de la
// Puerta (carga inicial del dashboard, con cookie reenviada). El lado cliente
// re-fetchea vía el proxy same-origin /app/puerta/api/stats al cambiar filtros.

import { PuertaStatsResponseSchema, type PuertaStatsResponse } from '@contan2/contracts';
import { apiGet } from './client';

// null si la API cae → la página muestra Unavailable.
export async function getPuertaStats(from: string, to: string, sala?: string): Promise<PuertaStatsResponse | null> {
  try {
    const p = new URLSearchParams({ from, to });
    if (sala) p.set('sala', sala);
    return await apiGet(`/api/v2/puerta/stats?${p.toString()}`, PuertaStatsResponseSchema);
  } catch {
    return null;
  }
}
