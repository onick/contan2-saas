// apps/web/lib/api/activities-create.ts · proxy server-side de ESCRITURA para
// crear actividad. El navegador NUNCA llama a api-v2 directo: el form (client)
// postea same-origin a /app/actividades/api y este proxy reenvía a api-v2
// (POST /api/v2/activities) con la cookie de sesión de staff (contan2_session)
// + host del tenant (x-forwarded-host) + IP real (x-forwarded-for), y relaya
// status + body TAL CUAL. api-v2 es el árbitro (rol owner/admin, validación
// Zod, tenant-scope). Este proxy no valida ni transforma; sólo reenvía.

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

export async function proxyCreateActivity(body: unknown): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/activities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    // Fallo de red hacia api-v2 → 502 (el cliente muestra "reintentá").
    return Response.json({ error: 'No pudimos crear la actividad. Intentá de nuevo.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

// Proxy de subida de portada (multipart) → api-v2 POST /activities/:id/cover.
// CLAVE: NO se setea manualmente `content-type: multipart/form-data` (perdería el
// boundary). Se REENVÍA el content-type entrante del navegador (que incluye el
// boundary) y el body como stream (duplex: 'half') → el boundary se preserva
// exacto y no se bufferiza el archivo. Reenvía cookie + forwarded headers; relaya
// status + body tal cual.
export async function proxyUploadCover(id: string, req: Request): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const contentType = req.headers.get('content-type');
  if (!contentType || !contentType.toLowerCase().startsWith('multipart/form-data')) {
    return Response.json({ error: 'Se esperaba multipart/form-data.' }, { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/activities/${encodeURIComponent(id)}/cover`, {
      method: 'POST',
      headers: {
        'content-type': contentType, // preserva el boundary generado por el navegador
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

// Proxy multipart de CREACIÓN ATÓMICA con portada → api-v2
// POST /api/v2/activities/with-cover. Reenvía el multipart entrante TAL CUAL
// (preserva el boundary del navegador, NO base64), cookie + forwarded headers,
// body como stream (duplex 'half'); relaya status + body exacto. api-v2 es el
// árbitro (rol, validación, atomicidad portada+INSERT).
export async function proxyCreateActivityWithCover(req: Request): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const contentType = req.headers.get('content-type');
  if (!contentType || !contentType.toLowerCase().startsWith('multipart/form-data')) {
    return Response.json({ error: 'Se esperaba multipart/form-data.' }, { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/activities/with-cover`, {
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
    return Response.json({ error: 'No pudimos crear la actividad. Intentá de nuevo.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
