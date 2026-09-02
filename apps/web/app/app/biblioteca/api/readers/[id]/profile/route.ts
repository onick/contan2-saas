// PATCH perfil bibliotecario (tipo/código RRHH/cédula/notas) → api-v2.
import { proxyAuth } from '../../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyAuth('PATCH', `/api/v2/biblio/readers/${encodeURIComponent(id)}/profile`, body, true);
}
