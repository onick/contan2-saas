// BFF → api-v2 POST /puerta/bookings/:id/checkin (check-in desde la reserva).
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('POST', `/api/v2/puerta/bookings/${encodeURIComponent(id)}/checkin`, {}, true);
}
