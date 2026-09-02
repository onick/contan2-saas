// BFF GET → api-v2 GET /api/v2/biblio/export.xlsx (cookie + forwarded).
// Descarga del catálogo con los filtros activos (?q=&kind=&subject=&siteId=&disponible=).
// Relay binario (preserva content-type/disposition). api-v2 arbitra rol/tenant.
import { relayReport } from '../../../../../lib/api/reports-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).search;
  return relayReport(`/api/v2/biblio/export.xlsx${search}`);
}
