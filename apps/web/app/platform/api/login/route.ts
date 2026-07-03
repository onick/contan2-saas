// BFF POST → api-v2 /platform/auth/login. Relaya Set-Cookie (contan2_admin_session).
import { proxyPlatformLogin } from '../../../../lib/api/platform-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyPlatformLogin(body);
}
