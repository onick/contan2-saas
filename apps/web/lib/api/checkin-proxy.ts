// apps/web/lib/api/checkin-proxy.ts · proxies server-side de la consola de check-in.
// El navegador NUNCA llama a api-v2 directo: la consola (client) pega same-origin a
// /app/check-in/api/* y estos proxies reenvían a api-v2 con la cookie de sesión +
// forwarding headers (x-forwarded-host/for), relayando status + body TAL CUAL.
// api-v2 es el árbitro (rol, tenant-scope, capacidad, idempotencia). Si api-v2 está
// caído → 502 (la UI muestra estado honesto, NUNCA demo).

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

async function relay(path: string, init: { method: string; headers?: Record<string, string>; body?: string }, netError: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method,
      headers: {
        ...(init.headers ?? {}),
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

export const proxyCheckinMetrics = () =>
  relay('/api/v2/checkin/metrics', { method: 'GET' }, 'No pudimos cargar las métricas.');

export const proxyCheckinActivities = () =>
  relay('/api/v2/checkin/activities', { method: 'GET' }, 'No pudimos cargar las actividades.');

export const proxyCheckinVisitors = (search: string) =>
  relay(`/api/v2/checkin/visitors${search}`, { method: 'GET' }, 'No pudimos buscar visitantes.');

// Feed de recepción: últimos registros (reusa GET /attendance, ya ordena desc).
export const proxyCheckinRecent = (search: string) =>
  relay(`/api/v2/attendance${search}`, { method: 'GET' }, 'No pudimos cargar los check-ins recientes.');

export const proxyCheckin = (body: unknown) =>
  relay('/api/v2/checkin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 'No pudimos registrar el check-in.');

// El Idempotency-Key se reenvía SÓLO en anonymous (protección anti doble-click).
export const proxyCheckinAnonymous = (body: unknown, idempotencyKey: string | null) =>
  relay(
    '/api/v2/checkin/anonymous',
    { method: 'POST', headers: { 'content-type': 'application/json', ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) }, body: JSON.stringify(body) },
    'No pudimos registrar el ingreso.',
  );
