// BFF GET → api-v2 GET /api/v2/reports/attendance-by-activity (cookie + forwarded).
// Relaya el query TAL CUAL (from/to/format). Sirve JSON (preview) y descargas.
import { proxyReportAttendance } from '../../../../../lib/api/reports-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return proxyReportAttendance(new URL(request.url).search);
}
