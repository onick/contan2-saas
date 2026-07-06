import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let b: unknown; try { b = await req.json(); } catch { b = {}; }
  return proxyAuth('POST', `/api/v2/puerta/salas/${encodeURIComponent(id)}/occupancy`, b, true);
}
