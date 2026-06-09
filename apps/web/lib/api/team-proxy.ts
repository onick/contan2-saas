// apps/web/lib/api/team-proxy.ts · proxy server-side de Mi equipo. El navegador
// pega same-origin a /app/equipo/api/team y esto reenvía a api-v2 GET /org/team con
// la cookie + forwarding headers, relayando status + body. api-v2 es el árbitro
// (rol owner/admin, tenant-scope, selección segura sin hashes).

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

async function relay(path: string, init: { method: string; body?: string }, netError: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method,
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      ...(init.body !== undefined ? { body: init.body } : {}),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: netError }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export const proxyTeam = (search: string) =>
  relay(`/api/v2/org/team${search}`, { method: 'GET' }, 'No pudimos cargar el equipo.');

// id ya viene de params (server-side); se encodea por las dudas.
export const proxyTeamRole = (id: string, body: string) =>
  relay(`/api/v2/org/team/${encodeURIComponent(id)}/role`, { method: 'PATCH', body }, 'No pudimos cambiar el rol.');
export const proxyTeamStatus = (id: string, body: string) =>
  relay(`/api/v2/org/team/${encodeURIComponent(id)}/status`, { method: 'PATCH', body }, 'No pudimos cambiar el estado.');
