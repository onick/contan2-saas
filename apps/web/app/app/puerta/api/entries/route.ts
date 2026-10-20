// BFF → api-v2 GET /puerta/entries?date=&salaId=&limit=&offset= (entradas del día, sin PII).
import { puertaEnabled, puertaOff } from '../../../../../lib/puerta/flag';
import { proxyAuth } from '../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  if (!puertaEnabled()) return puertaOff();
  const search = new URL(req.url).search;
  return proxyAuth('GET', `/api/v2/puerta/entries${search}`, undefined, true);
}
