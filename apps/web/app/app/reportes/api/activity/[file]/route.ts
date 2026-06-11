// GET /app/reportes/api/activity/<id>.<xlsx|pdf> → api-v2 (binario).
import { relayReport } from '../../../../../../lib/api/reports-proxy';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params;
  return relayReport(`/api/v2/reports/activity/${encodeURIComponent(file)}`);
}
