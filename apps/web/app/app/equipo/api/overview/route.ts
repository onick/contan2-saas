// BFF GET → api-v2 GET /api/v2/org/team/overview (KPIs + resumen por rol).
import { proxyTeamOverview } from '../../../../../lib/api/team-proxy';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return proxyTeamOverview();
}
