// BFF GET → api-v2 GET /api/v2/reports/month.xlsx (cookie + forwarded).
// Descarga el "registro mensual" (formato del departamento) para un año/mes.
// Relay binario (preserva content-type/disposition del xlsx).
import { relayReport } from '../../../../../lib/api/reports-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).search;
  return relayReport(`/api/v2/reports/month.xlsx${search}`);
}
