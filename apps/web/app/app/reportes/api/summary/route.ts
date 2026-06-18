// GET ?from&to&types → api-v2 /reports/period-summary (JSON). Relay con cookie.
import { relayReport } from '../../../../../lib/api/reports-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return relayReport(`/api/v2/reports/period-summary?${url.searchParams.toString()}`);
}
