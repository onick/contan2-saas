// POST /app/actividades/api/<id>/import-guests?commit= · relay MULTIPART →
// api-v2 /activities/:id/import-guests. Preserva boundary + cookie + query.
import { cookies } from 'next/headers';
import { forwardingHeaders } from '../../../../../../lib/api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const ct = req.headers.get('content-type');
  if (!ct || !ct.toLowerCase().startsWith('multipart/form-data')) {
    return Response.json({ error: 'Se esperaba un archivo (multipart/form-data).' }, { status: 400 });
  }
  const { id } = await ctx.params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const search = new URL(req.url).search;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/activities/${encodeURIComponent(id)}/import-guests${search}`, {
      method: 'POST',
      headers: { 'content-type': ct, ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...(await forwardingHeaders()) },
      body: req.body,
      // @ts-expect-error duplex requerido por undici al enviar un stream
      duplex: 'half',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos procesar el archivo. Intentá de nuevo.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' } });
}
