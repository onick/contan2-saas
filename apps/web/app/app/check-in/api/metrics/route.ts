// BFF GET → api-v2 GET /api/v2/checkin/metrics (cookie + forwarded; relay exacto).
import { proxyCheckinMetrics } from '../../../../../lib/api/checkin-proxy';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> { return proxyCheckinMetrics(); }
