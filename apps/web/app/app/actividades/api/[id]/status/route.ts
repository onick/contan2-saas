// app/app/actividades/api/[id]/status/route.ts · proxy PATCH same-origin →
// api-v2 PATCH /api/v2/activities/:id/status. El menú de acciones (client) hace
// PATCH acá con { status }; este handler reenvía con cookie + forwarding headers
// y relaya status + body. JSON inválido → 400; fallo de red → 502.
import { proxyUpdateStatus } from '../../../../../../lib/api/activities-edit';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyUpdateStatus(id, body);
}
