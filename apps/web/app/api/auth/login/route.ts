// app/api/auth/login/route.ts · proxy POST → api-v2 POST /auth/login.
// Fuera de /app (no lo cubre el middleware): accesible sin sesión para iniciarla.
// El navegador manda { email, password, rememberMe }; api-v2 valida y devuelve
// Set-Cookie contan2_session que este handler relaya. No escribe negocio.
import { proxyLogin } from '../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyLogin(body);
}
