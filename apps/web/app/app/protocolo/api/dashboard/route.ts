// GET dashboard de Protocolo (KPIs+invitados+actividad) → api-v2. Para refetch
// del cliente tras designar/invitar/quitar.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  return proxyAuth('GET', '/api/v2/protocol/dashboard', undefined, true);
}
