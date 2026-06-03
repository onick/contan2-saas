// app/scanner/api/me/route.ts · proxy GET → api-v2 GET /scanner/me.
// Reenvía la cookie scanner_session para validar la sesión del tenant.
import { proxyToApiV2 } from '../../../../lib/api/scanner';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return proxyToApiV2({ method: 'GET', path: '/api/v2/scanner/me', forwardScannerCookie: true });
}
