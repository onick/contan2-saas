// POST agregar ejemplar → api-v2 /biblio/titles/:id/items.
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyAuth('POST', `/api/v2/biblio/titles/${encodeURIComponent(id)}/items`, body, true);
}
