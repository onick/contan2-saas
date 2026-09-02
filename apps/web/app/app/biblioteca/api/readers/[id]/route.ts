// GET detalle de un lector → api-v2 /biblio/readers/:id.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('GET', `/api/v2/biblio/readers/${encodeURIComponent(id)}`, undefined, true);
}
