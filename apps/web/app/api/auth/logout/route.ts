// app/api/auth/logout/route.ts · proxy POST → api-v2 POST /auth/logout.
// Revoca la sesión en DB (solo la del token presentado) y responde 303 → /login
// relayando la cookie de borrado. Form-post sin JS: la redirección la sigue el
// navegador con la cookie ya limpiada.
import { proxyLogout } from '../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return proxyLogout();
}
