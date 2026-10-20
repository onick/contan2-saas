// BFF → api-v2 POST /puerta/bookings/close-day?date= (cierre del día: vencidas sin asistencia → "No vino").
import { puertaEnabled, puertaOff } from '../../../../../../lib/puerta/flag';
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!puertaEnabled()) return puertaOff();
  const search = new URL(req.url).search;
  return proxyAuth('POST', `/api/v2/puerta/bookings/close-day${search}`, {}, true);
}
