import { proxyAuth } from '../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

// BFF · búsqueda global del command palette (⌘K): actividades + usuarios.
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  return proxyAuth('GET', `/api/v2/search${qs}`, undefined, true);
}
