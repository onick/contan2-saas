// POST suspender/reactivar el servicio de biblioteca del lector → api-v2.
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyAuth('POST', `/api/v2/biblio/readers/${encodeURIComponent(id)}/suspend`, body, true);
}
