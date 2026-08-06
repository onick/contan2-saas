// POST {query} → api-v2 /reports/agent (Asistente de Reportes). Relay con cookie.
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  return proxyAuth('POST', '/api/v2/reports/agent', body, true);
}
