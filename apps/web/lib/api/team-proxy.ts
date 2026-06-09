// apps/web/lib/api/team-proxy.ts · proxy server-side de Mi equipo. El navegador
// pega same-origin a /app/equipo/api/team y esto reenvía a api-v2 GET /org/team con
// la cookie + forwarding headers, relayando status + body. api-v2 es el árbitro
// (rol owner/admin, tenant-scope, selección segura sin hashes).

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

export async function proxyTeam(search: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/org/team${search}`, {
      method: 'GET',
      headers: {
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos cargar el equipo.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
