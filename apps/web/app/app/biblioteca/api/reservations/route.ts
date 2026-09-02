// GET lista de reservas (tab/q/page) · POST reservar → api-v2 /biblio/reservations.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return proxyAuth('GET', `/api/v2/biblio/reservations?${url.searchParams.toString()}`, undefined, true);
}
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  return proxyAuth('POST', '/api/v2/biblio/reservations', body, true);
}
