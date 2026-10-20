// BFF → api-v2 GET /puerta/bookings/:id/history (historial de la reserva desde la auditoría).
import { puertaEnabled, puertaOff } from '../../../../../../../lib/puerta/flag';
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!puertaEnabled()) return puertaOff();
  const { id } = await ctx.params;
  return proxyAuth('GET', `/api/v2/puerta/bookings/${encodeURIComponent(id)}/history`, undefined, true);
}
