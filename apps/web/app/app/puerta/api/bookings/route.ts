// BFF agenda VR → api-v2 /puerta/bookings. GET (lista, forward query) + POST (crear).
import { proxyAuth } from '../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const search = new URL(req.url).search;
  return proxyAuth('GET', `/api/v2/puerta/bookings${search}`, undefined, true);
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('POST', '/api/v2/puerta/bookings', body, true);
}
