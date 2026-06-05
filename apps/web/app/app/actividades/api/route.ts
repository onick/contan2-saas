// app/app/actividades/api/route.ts · proxy POST same-origin → api-v2
// POST /api/v2/activities. El form de "Nueva actividad" (client) postea acá el
// cuerpo ya en forma de contrato (fechas en ISO); este handler reenvía con la
// cookie de sesión + forwarding headers y relaya status + body. JSON inválido →
// 400; fallo de red → 502 (lo decide proxyCreateActivity).
import { proxyCreateActivity } from '../../../../lib/api/activities-create';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyCreateActivity(body);
}
