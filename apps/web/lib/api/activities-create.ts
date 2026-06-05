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
