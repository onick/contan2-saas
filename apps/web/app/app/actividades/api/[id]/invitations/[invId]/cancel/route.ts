// POST cancelar una invitación pendiente → api-v2 /activities/:id/invitations/:invId/cancel (204/404).
import { proxyAuth } from '../../../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; invId: string }> }): Promise<Response> {
  const { id, invId } = await ctx.params;
  return proxyAuth('POST', `/api/v2/activities/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invId)}/cancel`, undefined, true);
}
