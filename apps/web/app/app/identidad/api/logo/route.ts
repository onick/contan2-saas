// POST /app/identidad/api/logo · relay MULTIPART → api-v2 /org/branding/logo.
// Sube el logo del tenant (un archivo). Preserva boundary + cookie. owner/admin.
import { cookies } from 'next/headers';
import { forwardingHeaders } from '../../../../../lib/api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const ct = req.headers.get('content-type');
  if (!ct || !ct.toLowerCase().startsWith('multipart/form-data')) {
    return Response.json({ error: 'Se esperaba un archivo (multipart/form-data).' }, { status: 400 });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/org/branding/logo`, {
      method: 'POST',
      headers: { 'content-type': ct, ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(await forwardingHeaders()) },
      body: req.body,
      // @ts-expect-error duplex requerido por undici al enviar un stream
      duplex: 'half',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos subir el logo. Intentá de nuevo.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
