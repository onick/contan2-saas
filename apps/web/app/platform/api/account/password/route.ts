// BFF POST → api-v2 /platform/auth/change-password.
import { proxyPlatform } from '../../../../../lib/api/platform-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
  let body: unknown; try { body = await req.json(); } catch { body = {}; }
  return proxyPlatform('POST', '/api/v2/platform/auth/change-password', body);
}
