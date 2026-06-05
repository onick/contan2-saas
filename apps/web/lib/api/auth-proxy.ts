// apps/web/lib/api/auth-proxy.ts · proxies same-origin web→api-v2 para
// login/logout del admin. El navegador NUNCA habla directo con api-v2 (interno):
// estos helpers reenvían host del tenant (x-forwarded-host) + IP real
// (x-forwarded-for) y RELAYAN el Set-Cookie de api-v2 al navegador same-origin.
// NUNCA loguean el body (password) ni el token.

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

// Proxy del login: manda {email,password,rememberMe} a api-v2 → relaya status,
// body JSON y Set-Cookie (contan2_session). 502 si api-v2 no responde.
export async function proxyLogin(body: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(await forwardingHeaders()),
  };
  let up: Response;
  try {
    up = await fetch(`${API_BASE_URL}/api/v2/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      { error: 'No pudimos conectar con el servidor. Intentá de nuevo.' },
      { status: 502 },
    );
  }
  const text = await up.text();
  const res = new Response(text, {
    status: up.status,
    headers: { 'content-type': up.headers.get('content-type') ?? 'application/json' },
  });
  for (const c of up.headers.getSetCookie()) res.headers.append('set-cookie', c);
  return res;
}

// Proxy del logout: reenvía la cookie de sesión a api-v2 (que REVOCA en DB sólo
// esa sesión) y responde 303 → /login relayando la cookie de borrado de api-v2.
// Si api-v2 no responde, limpia igual la cookie local (no dejar al user colgado).
export async function proxyLogout(): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const headers: Record<string, string> = { ...(await forwardingHeaders()) };
  if (token) headers.cookie = `${SESSION_COOKIE}=${token}`;

  const redirectToLogin = (setCookies: string[]): Response => {
    const res = new Response(null, { status: 303, headers: { location: '/login' } });
    for (const c of setCookies) res.headers.append('set-cookie', c);
    return res;
  };

  let up: Response;
  try {
    up = await fetch(`${API_BASE_URL}/api/v2/auth/logout`, {
      method: 'POST',
      headers,
      cache: 'no-store',
    });
  } catch {
    // api-v2 caído: borra la cookie local igualmente (host-only).
    return redirectToLogin([`${SESSION_COOKIE}=; Path=/; Max-Age=0`]);
  }
  return redirectToLogin(up.headers.getSetCookie());
}
