import { proxyAuth } from '../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

// BFF · resumen del shell (rol + badges vivos) para el sidebar admin.
export async function GET(): Promise<Response> {
  return proxyAuth('GET', '/api/v2/shell/summary', undefined, true);
}
