// apps/web/lib/api/platform-proxy.ts · proxies same-origin web→api-v2 para el
// PLATFORM ADMIN. Cookie propia contan2_admin_session (separada de la del
// tenant). Relaya Set-Cookie del login/logout y reenvía la cookie en las
// llamadas autenticadas. Nunca loguea bodies (password) ni tokens.

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const ADMIN_COOKIE = 'contan2_admin_session';

export async function proxyPlatformLogin(body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(await forwardingHeaders()) };
  let up: Response;
  try {
    up = await fetch(`${API_BASE_URL}/api/v2/platform/auth/login`, {
      method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos conectar con el servidor. Intentá de nuevo.' }, { status: 502 });
  }
  const text = await up.text();
  const res = new Response(text, {
    status: up.status,
    headers: { 'content-type': up.headers.get('content-type') ?? 'application/json' },
  });
  for (const c of up.headers.getSetCookie()) res.headers.append('set-cookie', c);
  return res;
}

export async function proxyPlatformLogout(): Promise<Response> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const headers: Record<string, string> = { ...(await forwardingHeaders()) };
  if (token) headers.cookie = `${ADMIN_COOKIE}=${token}`;
  const redirect = (setCookies: string[]): Response => {
    const res = new Response(null, { status: 303, headers: { location: '/platform/login' } });
    for (const c of setCookies) res.headers.append('set-cookie', c);
    return res;
  };
  let up: Response;
  try {
    up = await fetch(`${API_BASE_URL}/api/v2/platform/auth/logout`, { method: 'POST', headers, cache: 'no-store' });
  } catch {
    return redirect([`${ADMIN_COOKIE}=; Path=/; Max-Age=0`]);
  }
  return redirect(up.headers.getSetCookie());
}

// Relay JSON autenticado (GET/POST/PATCH) con la cookie de admin. Para KPIs,
// tenants, detalle y acciones. api-v2 arbitra el guard (401/403).
export async function proxyPlatform(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const headers: Record<string, string> = {
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(await forwardingHeaders()),
  };
  if (token) headers.cookie = `${ADMIN_COOKIE}=${token}`;
  let up: Response;
  try {
    up = await fetch(`${API_BASE_URL}${path}`, {
      method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'Problema de red. Reintentá.' }, { status: 502 });
  }
  const text = await up.text();
  return new Response(text, {
    status: up.status,
    headers: { 'content-type': up.headers.get('content-type') ?? 'application/json' },
  });
}
