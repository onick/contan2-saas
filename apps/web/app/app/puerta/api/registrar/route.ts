import { puertaEnabled, puertaOff } from '../../../../../lib/puerta/flag';
import { proxyAuth } from '../../../../../lib/api/auth-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
  if (!puertaEnabled()) return puertaOff();
  let b: unknown; try { b = await req.json(); } catch { b = {}; }
  // Idempotency-Key (PUE-A01): se reenvía tal cual para que un reintento no duplique.
  const key = req.headers.get('idempotency-key');
  return proxyAuth('POST', '/api/v2/puerta/registrar', b, true, key ? { 'idempotency-key': key } : undefined);
}
