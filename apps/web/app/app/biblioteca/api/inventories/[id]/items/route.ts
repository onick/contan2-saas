// GET filas de un inventario (tab/q/page) → api-v2.
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  return proxyAuth('GET', `/api/v2/biblio/inventories/${encodeURIComponent(id)}/items?${url.searchParams.toString()}`, undefined, true);
}
