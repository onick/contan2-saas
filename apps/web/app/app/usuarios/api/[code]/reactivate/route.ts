// BFF POST → api-v2 POST /api/v2/users/:code/reactivate (relay exacto).
import { proxyUserReactivate } from '../../../../../../lib/api/profile-proxy';
export const dynamic = 'force-dynamic';
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await ctx.params;
  return proxyUserReactivate(code);
}
