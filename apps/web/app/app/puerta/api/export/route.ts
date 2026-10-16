// BFF GET → api-v2 GET /api/v2/puerta/export.xlsx (cookie + forwarded).
// Descarga la data de las salas permanentes (?sala=&from=&to=). Relay binario
// (preserva content-type/disposition del xlsx). api-v2 arbitra rol/tenant.
import { puertaEnabled, puertaOff } from '../../../../../lib/puerta/flag';
import { relayReport } from '../../../../../lib/api/reports-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (!puertaEnabled()) return puertaOff();
  const search = new URL(request.url).search;
  return relayReport(`/api/v2/puerta/export.xlsx${search}`);
}
