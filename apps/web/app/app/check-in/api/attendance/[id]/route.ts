// DELETE → api-v2 /attendance/:id · PATCH → editar acompañantes (owner/admin lo
// arbitra api-v2).
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyAuth('DELETE', `/api/v2/attendance/${encodeURIComponent(id)}`, undefined, true);
}
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('PATCH', `/api/v2/attendance/${encodeURIComponent(id)}`, body, true);
}
