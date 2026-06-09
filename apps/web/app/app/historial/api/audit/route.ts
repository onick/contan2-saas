// BFF GET → api-v2 GET /api/v2/org/audit (cookie + forwarded). Relaya el query
// TAL CUAL (action/actor/targetType/from/to/cursor/limit).
import { proxyAuditLog } from '../../../../../lib/api/audit-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return proxyAuditLog(new URL(request.url).search);
}
