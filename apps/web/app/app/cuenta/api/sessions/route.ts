// GET → api-v2 /auth/sessions (autenticado).
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  return proxyAuth('GET', '/api/v2/auth/sessions', undefined, true);
}
