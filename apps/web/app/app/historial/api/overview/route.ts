// BFF GET → api-v2 GET /api/v2/org/audit/overview (KPIs + donut + top actores).
import { proxyAuditOverview } from '../../../../../lib/api/audit-proxy';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return proxyAuditOverview();
}
