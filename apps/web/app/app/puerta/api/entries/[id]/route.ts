// BFF → api-v2 DELETE /puerta/entries/:id (Deshacer una entrada de la Puerta).
import { puertaEnabled, puertaOff } from '../../../../../../lib/puerta/flag';
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!puertaEnabled()) return puertaOff();
  const { id } = await ctx.params;
  return proxyAuth('DELETE', `/api/v2/puerta/entries/${encodeURIComponent(id)}`, undefined, true);
}
