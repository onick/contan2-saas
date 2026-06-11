// GET lista+summary · POST {userIds} → api-v2 /activities/:id/invitations.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('GET', `/api/v2/activities/${encodeURIComponent(id)}/invitations`, undefined, true);
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('POST', `/api/v2/activities/${encodeURIComponent(id)}/invitations`, body, true);
}
