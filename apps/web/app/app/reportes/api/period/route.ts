// GET ?kind=preview|xlsx|pdf&from&to&types&categories → api-v2 /reports/period*.
import { relayReport } from '../../../../../lib/api/reports-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') ?? 'preview';
  url.searchParams.delete('kind');
  const qs = url.searchParams.toString();
  const path = kind === 'xlsx' ? `/api/v2/reports/period.xlsx?${qs}`
    : kind === 'pdf' ? `/api/v2/reports/period.pdf?${qs}`
    : `/api/v2/reports/period/preview?${qs}`;
  return relayReport(path);
}
