// GET lista · POST crear → api-v2 /staff/invitations (cookie + forwarding).
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  return proxyAuth('GET', '/api/v2/staff/invitations', undefined, true);
}
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('POST', '/api/v2/staff/invitations', body, true);
}
