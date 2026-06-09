// BFF POST → api-v2 POST /api/v2/users/:code/archive (soft-archive · relay exacto).
import { proxyUserArchive } from '../../../../../../lib/api/profile-proxy';
export const dynamic = 'force-dynamic';
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await ctx.params;
  return proxyUserArchive(code);
}
