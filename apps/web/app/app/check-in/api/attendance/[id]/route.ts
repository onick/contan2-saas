// DELETE → api-v2 /attendance/:id (owner/admin lo arbitra api-v2).
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('DELETE', `/api/v2/attendance/${encodeURIComponent(id)}`, undefined, true);
}
