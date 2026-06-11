// POST → api-v2 /credentials/bulk-send (cookie + forwarding). owner/admin lo
// arbitra api-v2; el body pasa tal cual ({cohort:'noCredential'} desde la UI).
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('POST', '/api/v2/credentials/bulk-send', body, true);
}
