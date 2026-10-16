// BFF → api-v2 POST /puerta/bookings/:id/checkin (check-in desde la reserva).
import { puertaEnabled, puertaOff } from '../../../../../../../lib/puerta/flag';
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!puertaEnabled()) return puertaOff();
  const { id } = await ctx.params;
  return proxyAuth('POST', `/api/v2/puerta/bookings/${encodeURIComponent(id)}/checkin`, {}, true);
}
