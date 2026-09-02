// POST escanear ejemplar de un inventario → api-v2.
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyAuth('POST', `/api/v2/biblio/inventories/${encodeURIComponent(id)}/scan`, body, true);
}
