// GET ejemplares dados de baja (tab Bajas) → api-v2 /biblio/retired-items.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return proxyAuth('GET', `/api/v2/biblio/retired-items?${url.searchParams.toString()}`, undefined, true);
}
