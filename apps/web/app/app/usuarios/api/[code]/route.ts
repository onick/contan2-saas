// BFF PATCH → api-v2 PATCH /api/v2/users/:code (editar visitante · relay exacto).
import { proxyUserUpdate } from '../../../../../lib/api/profile-proxy';
export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await ctx.params;
  const body = await req.text();
  return proxyUserUpdate(code, body);
}
