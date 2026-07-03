// BFF DELETE → api-v2 /platform/auth/sessions/:id.
import { proxyPlatform } from '../../../../../../lib/api/platform-proxy';
export const dynamic = 'force-dynamic';
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyPlatform('DELETE', `/api/v2/platform/auth/sessions/${encodeURIComponent(id)}`);
}
