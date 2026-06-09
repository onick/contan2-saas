// BFF GET → api-v2 GET /api/v2/org/team (cookie + forwarded). Relaya el query
// TAL CUAL (q/role/status/cursor/limit).
import { proxyTeam } from '../../../../../lib/api/team-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return proxyTeam(new URL(request.url).search);
}
