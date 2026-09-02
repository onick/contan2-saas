// POST devolver por código de ejemplar (escaneo) → api-v2 /biblio/returns.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  return proxyAuth('POST', '/api/v2/biblio/returns', body, true);
}
