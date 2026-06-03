// app/scanner/api/logout/route.ts · proxy POST → api-v2 POST /scanner/logout.
// api-v2 responde con Set-Cookie que borra scanner_session; se relaya.
import { proxyToApiV2 } from '../../../../lib/api/scanner';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return proxyToApiV2({ method: 'POST', path: '/api/v2/scanner/logout', forwardScannerCookie: true });
}
