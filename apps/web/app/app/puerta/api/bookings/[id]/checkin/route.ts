// BFF → api-v2 POST /puerta/bookings/:id/checkin (check-in desde la reserva).
// Reenvía `force` (solo owner/admin) para registrar una reserva de otro día.
import { puertaEnabled, puertaOff } from '../../../../../../../lib/puerta/flag';
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!puertaEnabled()) return puertaOff();
  const { id } = await ctx.params;
  let b: { force?: unknown } = {};
  try { b = await req.json(); } catch { b = {}; }
  return proxyAuth('POST', `/api/v2/puerta/bookings/${encodeURIComponent(id)}/checkin`, b.force === true ? { force: true } : {}, true);
}
