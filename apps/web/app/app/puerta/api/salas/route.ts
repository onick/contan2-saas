import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(): Promise<Response> { return proxyAuth('GET', '/api/v2/puerta/salas', undefined, true); }
