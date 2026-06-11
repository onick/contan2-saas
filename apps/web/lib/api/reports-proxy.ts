// apps/web/lib/api/reports-proxy.ts · proxy server-side de reportes.
// El navegador pega same-origin a /app/reportes/api/* y esto reenvía a api-v2 con
// la cookie de sesión + forwarding headers. Relay BINARIO: preserva status, body
// crudo (ArrayBuffer) y content-type/content-disposition TAL CUAL → sirve por igual
// el JSON de preview y las descargas (csv/xlsx/pdf, que NO deben corromperse como
// texto). api-v2 es el árbitro (rol owner/admin, tenant-scope, rango, rate-limit).

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

export async function proxyReportAttendance(search: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/reports/attendance-by-activity${search}`, {
      method: 'GET',
      headers: {
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos generar el reporte.' }, { status: 502 });
  }
  const buf = await upstream.arrayBuffer();
  const out: Record<string, string> = {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
  };
  const cd = upstream.headers.get('content-disposition');
  if (cd) out['content-disposition'] = cd;
  return new Response(buf, { status: upstream.status, headers: out });
}

// ── S2 · relay binario de la reportería branded ──────────────────────────────
// GET con cookie + forwarding; los binarios (xlsx/pdf) se relayan con su
// content-type y content-disposition intactos (el navegador descarga).
export async function relayReport(path: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos generar el reporte. Reintentá.' }, { status: 502 });
  }
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition', 'cache-control']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
