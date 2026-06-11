// GET → api-v2 /segments (catálogo para el selector del panel de invitar).
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  return proxyAuth('GET', '/api/v2/segments', undefined, true);
}
