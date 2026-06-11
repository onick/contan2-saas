// GET ?segment= → api-v2 /activities/:id/invite-candidates (cookie+fwd).
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const qs = new URL(req.url).search;
  return proxyAuth('GET', `/api/v2/activities/${encodeURIComponent(id)}/invite-candidates${qs}`, undefined, true);
}
