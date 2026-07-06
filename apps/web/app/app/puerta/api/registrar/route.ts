import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
  let b: unknown; try { b = await req.json(); } catch { b = {}; }
  return proxyAuth('POST', '/api/v2/puerta/registrar', b, true);
}
