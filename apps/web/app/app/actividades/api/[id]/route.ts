// app/app/actividades/api/[id]/route.ts · proxy same-origin → api-v2 para una
// actividad concreta. GET = detalle completo (precarga full-fidelity del drawer);
// PATCH = edición parcial. Ambos reenvían con cookie + forwarding headers y relayan
// status + body. JSON inválido → 400; fallo de red → 502.
import { proxyUpdateActivity, proxyGetActivity } from '../../../../../lib/api/activities-edit';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return proxyGetActivity(id);
}

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
