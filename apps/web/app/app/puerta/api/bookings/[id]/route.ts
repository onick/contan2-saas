// BFF → api-v2 PATCH /puerta/bookings/:id (confirmar/cancelar/no-vino/reprogramar).
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let b: unknown; try { b = await req.json(); } catch { b = {}; }
  return proxyAuth('PATCH', `/api/v2/puerta/bookings/${encodeURIComponent(id)}`, b, true);
}
