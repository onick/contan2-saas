// BFF POST → api-v2 /platform/auth/logout. Revoca + limpia cookie, 303 a login.
import { proxyPlatformLogout } from '../../../../lib/api/platform-proxy';

export const dynamic = 'force-dynamic';

export function POST(): Promise<Response> {
  return proxyPlatformLogout();
}
