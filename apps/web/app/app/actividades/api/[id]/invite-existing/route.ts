// app/app/actividades/api/[id]/invite-existing/route.ts · proxy POST same-origin
// → api-v2 POST /activities/:id/invite-existing. El drawer "Agregar del padrón"
// manda { userIds }; reenvía con cookie + forwarding headers y relaya status/body.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyAuth('POST', `/api/v2/activities/${encodeURIComponent(id)}/invite-existing`, body, true);
}
