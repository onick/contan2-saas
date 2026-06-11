// POST /reset/api → api-v2 POST /auth/reset-password (público).
import { proxyAuth } from '../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('POST', '/api/v2/auth/reset-password', body, false);
}
