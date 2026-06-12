// GET → api-v2 /auth/me (autenticado). Lo usa el menú de usuario del Topbar.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  return proxyAuth('GET', '/api/v2/auth/me', undefined, true);
}
