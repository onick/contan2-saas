// GET candidatos de protocolo de una actividad → api-v2 (cookie + forwarded).
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('GET', `/api/v2/activities/${encodeURIComponent(id)}/protocol-candidates`, undefined, true);
}
