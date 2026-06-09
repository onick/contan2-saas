// BFF GET → api-v2 GET /api/v2/users/:code (detalle enriquecido · relay exacto).
import { proxyUserDetail } from '../../../../../../lib/api/profile-proxy';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await ctx.params;
  return proxyUserDetail(code);
}
