// GET resumen de circulación (hoy + alertas + política) → api-v2.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(): Promise<Response> {
  return proxyAuth('GET', '/api/v2/biblio/loans/summary', undefined, true);
}
