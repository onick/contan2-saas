// app/app/actividades/api/[id]/summary/route.ts · proxy GET same-origin →
// api-v2 GET /api/v2/activities/:id/summary (resumen post-evento/en vivo).
// Reenvía cookie + forwarding headers y relaya status + body tal cual.
import { proxyGetActivitySummary } from '../../../../../../lib/api/activities-edit';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyGetActivitySummary(id);
}
