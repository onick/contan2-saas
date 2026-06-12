// BFF de una designación → api-v2 /protocol/:userId (PATCH editar · DELETE desactivar).
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }): Promise<Response> {
  const { userId } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('PATCH', `/api/v2/protocol/${encodeURIComponent(userId)}`, body, true);
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ userId: string }> }): Promise<Response> {
  const { userId } = await ctx.params;
  return proxyAuth('DELETE', `/api/v2/protocol/${encodeURIComponent(userId)}`, undefined, true);
}
