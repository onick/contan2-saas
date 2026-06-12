// POST lote de invitaciones de protocolo {invites:[{userId, plusOnes}]} → api-v2.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyAuth('POST', `/api/v2/activities/${encodeURIComponent(id)}/protocol-invitations`, body, true);
}
