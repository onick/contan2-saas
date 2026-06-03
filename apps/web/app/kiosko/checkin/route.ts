// app/kiosko/checkin/route.ts · proxy POST same-origin → api-v2 POST /public/checkin.
// El kiosko (client) postea acá { activityId, visitor, companionsChildren }; este
// handler lo reenvía a api-v2 (host forwarding) y relaya status + body. ESCRITURA
// real (la confirmación del kiosko es el check-in). api-v2 arbitra cupo/duplicado.
import { proxyKioskCheckin } from '../../../lib/api/kiosko';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyKioskCheckin(body);
}
