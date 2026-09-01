// GET autofill por ISBN → api-v2 /biblio/isbn/:isbn.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ isbn: string }> }): Promise<Response> {
  const { isbn } = await ctx.params;
  return proxyAuth('GET', `/api/v2/biblio/isbn/${encodeURIComponent(isbn)}`, undefined, true);
}
