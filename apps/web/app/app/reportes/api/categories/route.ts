// BFF GET → api-v2 GET /api/v2/reports/categories (cookie + forwarded).
// Devuelve las categorías/ciclos del tenant para poblar el filtro del
// "reporte por ciclo". JSON liviano (sin PII), relayado con la sesión.
import { relayReport } from '../../../../../lib/api/reports-proxy';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return relayReport('/api/v2/reports/categories');
}
