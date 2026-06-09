import { proxyCheckinAnonymous } from '../../../../../lib/api/checkin-proxy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  return proxyCheckinAnonymous(body, req.headers.get('idempotency-key'));
}
