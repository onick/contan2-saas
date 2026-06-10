// BFF GET → api-v2 GET /api/v2/attendance (feed de recepción; cookie + forwarded).
// Relaya el query TAL CUAL (limit/dateFrom).
import { proxyCheckinRecent } from '../../../../../lib/api/checkin-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return proxyCheckinRecent(new URL(request.url).search);
}
