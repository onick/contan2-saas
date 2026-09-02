// GET export .xlsx de resultados del inventario (relay binario) → api-v2.
import { relayReport } from '../../../../../../../lib/api/reports-proxy';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return relayReport(`/api/v2/biblio/inventories/${encodeURIComponent(id)}/export.xlsx`);
}
