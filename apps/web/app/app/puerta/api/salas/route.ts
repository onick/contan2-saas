import { proxyAuth } from '../../../../../lib/api/auth-proxy';
import { puertaEnabled, puertaOff } from '../../../../../lib/puerta/flag';
export const dynamic = 'force-dynamic';
export function GET(): Promise<Response> {
  if (!puertaEnabled()) return Promise.resolve(puertaOff());
  return proxyAuth('GET', '/api/v2/puerta/salas', undefined, true);
}
