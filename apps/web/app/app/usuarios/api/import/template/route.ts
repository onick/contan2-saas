// GET /app/usuarios/api/import/template?format=csv|xlsx → api-v2 (binario).
import { relayReport } from '../../../../../../lib/api/reports-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  return relayReport(`/api/v2/users/import/template${new URL(req.url).search}`);
}
