// DELETE → api-v2 /auth/sessions/:id (autenticado; la actual → 400 del server).
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('DELETE', `/api/v2/auth/sessions/${encodeURIComponent(id)}`, undefined, true);
}
