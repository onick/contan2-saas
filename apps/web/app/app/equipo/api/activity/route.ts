// BFF GET → api-v2 GET /api/v2/org/audit (feed de actividad del equipo, acotado).
import { proxyTeamActivity } from '../../../../../lib/api/team-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const limit = new URL(request.url).searchParams.get('limit') ?? '8';
  return proxyTeamActivity(`?limit=${encodeURIComponent(limit)}`);
}
