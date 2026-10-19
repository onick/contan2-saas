// BFF GET → api-v2 GET /api/v2/reports/year.xlsx (cookie + forwarded).
// Descarga el libro anual "Registro_Actividades_Culturales" (12 hojas Ene–Dic +
// Resumen Mensual + Listas). Relay binario (preserva content-type/disposition).
import { relayReport } from '../../../../../lib/api/reports-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).search;
  return relayReport(`/api/v2/reports/year.xlsx${search}`);
}
