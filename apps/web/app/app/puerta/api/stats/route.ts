// GET ?from&to&sala → api-v2 /puerta/stats (JSON). Relay con cookie.
import { puertaEnabled, puertaOff } from '../../../../../lib/puerta/flag';
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(req: Request): Promise<Response> {
  if (!puertaEnabled()) return Promise.resolve(puertaOff());
  const url = new URL(req.url);
  return proxyAuth('GET', `/api/v2/puerta/stats?${url.searchParams.toString()}`, undefined, true);
}
