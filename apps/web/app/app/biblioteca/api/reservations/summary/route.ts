// GET resumen de reservas (activas/espera/retirar/vencen hoy + próximas) → api-v2.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export function GET(): Promise<Response> {
  return proxyAuth('GET', '/api/v2/biblio/reservations/summary', undefined, true);
}
