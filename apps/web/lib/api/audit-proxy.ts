// apps/web/lib/api/audit-proxy.ts · proxy server-side del Historial (log de
// auditoría). El navegador pega same-origin a /app/historial/api/audit y esto
// reenvía a api-v2 GET /org/audit con la cookie + forwarding headers, relayando
// status + body. api-v2 es el árbitro (rol owner/admin, tenant-scope, sanitización).

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

async function relayAudit(path: string, netError: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
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

export const proxyAuditLog = (search: string) =>
  relayAudit(`/api/v2/org/audit${search}`, 'No pudimos cargar el historial.');

export const proxyAuditOverview = () =>
  relayAudit('/api/v2/org/audit/overview', 'No pudimos cargar el resumen del historial.');
