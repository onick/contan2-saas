// app/app/actividades/api/with-cover/route.ts · proxy POST multipart same-origin →
// api-v2 POST /api/v2/activities/with-cover (creación atómica con portada). El
// drawer (client) postea acá un FormData (campos + 1 archivo optimizado); este
// handler reenvía preservando el boundary + cookie + forwarded headers y relaya
// status/body. NUNCA base64.
import { proxyCreateActivityWithCover } from '../../../../../lib/api/activities-create';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return proxyCreateActivityWithCover(req);
}
