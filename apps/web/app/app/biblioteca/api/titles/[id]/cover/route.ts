// BFF POST multipart → api-v2 POST /api/v2/biblio/titles/:id/cover.
// Reenvía el FormData preservando el boundary + cookie + forwarded headers
// (mismo patrón que las portadas de actividades). api-v2 valida rol/tenant,
// magic bytes y procesa a WebP.
import { cookies } from 'next/headers';
import { forwardingHeaders } from '../../../../../../../lib/api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const contentType = req.headers.get('content-type');
  if (!contentType || !contentType.toLowerCase().startsWith('multipart/form-data')) {
    return Response.json({ error: 'Se esperaba multipart/form-data.' }, { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/biblio/titles/${encodeURIComponent(id)}/cover`, {
      method: 'POST',
      headers: {
        'content-type': contentType, // preserva el boundary
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      body: req.body,
      // @ts-expect-error duplex es requerido por undici al enviar un stream y no está en los tipos
      duplex: 'half',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos subir la portada. Intentá de nuevo.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
