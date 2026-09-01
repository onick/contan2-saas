// GET lista (q/kind/page) · POST crear título → api-v2 /biblio/titles.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return proxyAuth('GET', `/api/v2/biblio/titles?${url.searchParams.toString()}`, undefined, true);
}
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  return proxyAuth('POST', '/api/v2/biblio/titles', body, true);
}
