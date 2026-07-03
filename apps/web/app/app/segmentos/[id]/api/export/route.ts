// GET /app/segmentos/[id]/api/export?format=xlsx|csv → api-v2
// /segments/:id/export (binario). Relay con cookie + forwarding; api-v2 arbitra
// rol (owner/admin), tenant-scope y 404.
import { relayReport } from '../../../../../../lib/api/reports-proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return relayReport(`/api/v2/segments/${encodeURIComponent(id)}/export${new URL(req.url).search}`);
}
