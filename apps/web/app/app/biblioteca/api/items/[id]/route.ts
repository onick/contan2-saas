// PATCH editar / dar de baja ejemplar → api-v2 /biblio/items/:id.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyAuth('PATCH', `/api/v2/biblio/items/${encodeURIComponent(id)}`, body, true);
}
