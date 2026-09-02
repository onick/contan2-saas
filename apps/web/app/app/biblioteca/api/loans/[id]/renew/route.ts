// POST renovar un préstamo (+14 días, máx 2) → api-v2.
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('POST', `/api/v2/biblio/loans/${encodeURIComponent(id)}/renew`, {}, true);
}
