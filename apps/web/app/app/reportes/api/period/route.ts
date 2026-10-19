// GET ?kind=xlsx|pdf&from&to&types&categories → api-v2 /reports/period.(xlsx|pdf).
// (La vista previa JSON se eliminó: el dashboard usa /api/summary = period-summary.)
import { relayReport } from '../../../../../lib/api/reports-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  url.searchParams.delete('kind');
  const qs = url.searchParams.toString();
  if (kind !== 'xlsx' && kind !== 'pdf') {
    return Response.json({ error: 'Formato inválido: usa kind=xlsx o kind=pdf.' }, { status: 400 });
  }
  return relayReport(`/api/v2/reports/period.${kind}?${qs}`);
}
