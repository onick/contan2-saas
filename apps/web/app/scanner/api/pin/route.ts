// app/scanner/api/pin/route.ts · proxy POST → api-v2 POST /scanner/pin.
// El navegador manda { pin }; api-v2 valida y devuelve Set-Cookie scanner_session
// que este handler relaya. NO escribe nada de negocio.
import { proxyToApiV2 } from '../../../../lib/api/scanner';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyToApiV2({ method: 'POST', path: '/api/v2/scanner/pin', body });
}
