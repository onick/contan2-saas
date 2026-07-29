// GET ?from&to&sala → api-v2 /puerta/stats (JSON). Relay con cookie.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return proxyAuth('GET', `/api/v2/puerta/stats?${url.searchParams.toString()}`, undefined, true);
}
