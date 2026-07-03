// BFF GET → api-v2 /platform/auth/sessions.
import { proxyPlatform } from '../../../../../lib/api/platform-proxy';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  return proxyPlatform('GET', '/api/v2/platform/auth/sessions');
}
