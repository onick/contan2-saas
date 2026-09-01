// GET ficha + ejemplares · PATCH editar → api-v2 /biblio/titles/:id.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('GET', `/api/v2/biblio/titles/${encodeURIComponent(id)}`, undefined, true);
}
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyAuth('PATCH', `/api/v2/biblio/titles/${encodeURIComponent(id)}`, body, true);
}
