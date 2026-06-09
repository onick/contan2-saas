// BFF GET → api-v2 GET /api/v2/users/:code/activities (historial paginado).
import { proxyUserActivities } from '../../../../../../lib/api/profile-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await ctx.params;
  return proxyUserActivities(code, new URL(req.url).search);
}
