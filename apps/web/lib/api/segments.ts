// apps/web/lib/api/segments.ts · fetchers server-side de segmentos de audiencia
// (api-v2 GET /segments y /segments/:id, afinidad desde attendance). Mismo patrón
// que getUsersFacets: apiGet con headers reenviados; null si la API cae → la
// página muestra Unavailable (sin demo).

import {
  SegmentsResponseSchema,
  SegmentMembersResponseSchema,
  type SegmentsResponse,
  type SegmentMembersResponse,
} from '@contan2/contracts';
import { apiGet, ApiError } from './client';

export async function getSegments(): Promise<SegmentsResponse | null> {
  try {
    return await apiGet('/api/v2/segments', SegmentsResponseSchema);
  } catch {
    return null;
  }
}

// 404 (segmento inexistente) se distingue de caída para que la página haga
// notFound() en vez de Unavailable.
export type SegmentMembersResult =
  | { ok: true; data: SegmentMembersResponse }
  | { ok: false; reason: 'not-found' | 'unavailable' };

export async function getSegmentMembers(id: string): Promise<SegmentMembersResult> {
  try {
    const data = await apiGet(`/api/v2/segments/${encodeURIComponent(id)}`, SegmentMembersResponseSchema);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { ok: false, reason: 'not-found' };
    return { ok: false, reason: 'unavailable' };
  }
}
