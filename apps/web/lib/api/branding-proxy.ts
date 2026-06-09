// apps/web/lib/api/branding-proxy.ts · proxy server-side del editor de identidad.
// PATCH same-origin /app/identidad/api/branding → api-v2 PATCH /org/branding con la
// cookie + forwarding headers. api-v2 es el árbitro (owner/admin, validación, audit).

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

export async function proxyBrandingUpdate(body: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/org/branding`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      body,
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos guardar la identidad.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
