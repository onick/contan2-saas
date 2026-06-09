// BFF POST → api-v2 POST /api/v2/users/:code/credential (reenviar credencial).
// Reenvía SOLO la Idempotency-Key del cliente (evita reenvíos por retry/doble-click).
import { proxyUserCredential } from '../../../../../../lib/api/profile-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await ctx.params;
  const key = req.headers.get('idempotency-key') ?? '';
  return proxyUserCredential(code, key);
}
