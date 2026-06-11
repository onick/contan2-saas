// RSVP público same-origin: GET ?token= (preview) · POST {token, action}.
import { proxyAuth } from '../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  return proxyAuth('GET', `/api/v2/public/rsvp/${encodeURIComponent(token)}`, undefined, false);
}
export async function POST(req: Request): Promise<Response> {
  let body: { token?: string; action?: string } = {};
  try { body = (await req.json()) as typeof body; } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('POST', `/api/v2/public/rsvp/${encodeURIComponent(body.token ?? '')}`, { action: body.action }, false);
}
