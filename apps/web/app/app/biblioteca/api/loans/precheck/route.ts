// GET precheck del flujo de 2 escaneos (carné/ejemplar) → api-v2.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return proxyAuth('GET', `/api/v2/biblio/loans/precheck?${url.searchParams.toString()}`, undefined, true);
}
