// app/app/actividades/api/[id]/route.ts · proxy PATCH same-origin → api-v2
// PATCH /api/v2/activities/:id (edición parcial). El drawer de edición (client)
// hace PATCH acá con el cuerpo ya en forma de contrato (sólo campos modificados,
// fechas en ISO); este handler reenvía con cookie + forwarding headers y relaya
// status + body. JSON inválido → 400; fallo de red → 502 (proxyUpdateActivity).
import { proxyUpdateActivity } from '../../../../../lib/api/activities-edit';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyUpdateActivity(id, body);
}
