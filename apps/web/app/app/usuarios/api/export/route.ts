// GET /app/usuarios/api/export?format=&scope=&cohort=&status=&q= → api-v2
// /users/export (binario CSV/XLSX). Relay con cookie + forwarding; api-v2
// arbitra rol (owner/admin), tenant-scope, rate-limit y auditoría.
import { relayReport } from '../../../../../lib/api/reports-proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return relayReport(`/api/v2/users/export${new URL(req.url).search}`);
}
