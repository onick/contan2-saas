// POST acciones de una invitación: body {action: 'resend'|'revoke'} → api-v2.
import { proxyAuth } from '../../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  let body: { action?: string } = {};
  try { body = (await req.json()) as { action?: string }; } catch { /* sin body */ }
  if (body.action !== 'resend' && body.action !== 'revoke') {
    return Response.json({ error: 'Acción inválida.' }, { status: 400 });
  }
  return proxyAuth('POST', `/api/v2/staff/invitations/${encodeURIComponent(id)}/${body.action}`, {}, true);
}
