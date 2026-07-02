// GET ?from&to → api-v2 /reports/protocol.xlsx (descarga branded). Sin rango → histórico.
import { relayReport } from '../../../../../lib/api/reports-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).searchParams.toString();
  return relayReport(`/api/v2/reports/protocol.xlsx${qs ? `?${qs}` : ''}`);
}
