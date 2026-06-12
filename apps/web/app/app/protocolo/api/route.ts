// BFF del directorio de protocolo → api-v2 /protocol (cookie + forwarded).
// GET relaya el query (?category=&all=1); POST designa (upsert).
import { proxyAuth } from '../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  return proxyAuth('GET', `/api/v2/protocol${new URL(req.url).search}`, undefined, true);
}
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('POST', '/api/v2/protocol', body, true);
}
