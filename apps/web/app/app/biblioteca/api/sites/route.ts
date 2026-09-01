// GET sitios · POST crear sitio → api-v2 /biblio/sites.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(): Promise<Response> { return proxyAuth('GET', '/api/v2/biblio/sites', undefined, true); }
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  return proxyAuth('POST', '/api/v2/biblio/sites', body, true);
}
