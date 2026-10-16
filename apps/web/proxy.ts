// apps/web/proxy.ts · proxy de borde (Next 16; antes middleware.ts, runtime
// Node: lee ROOT_DOMAIN en RUNTIME).
//
// 1) Ruteo por HOST de la raíz (la landing es HTML estático pre-renderizado):
//      marketing (contan2.com)  /        → rewrite a /landing (estática)
//      marketing                /landing → 308 a / (una sola URL canónica)
//      www.<root>               *        → 308 a https://<root><ruta>
//      admin.*                  /        → /platform
//      tenant (ccb.*, …)        /        → 307 /login
//      tenant                   /landing → 307 /login
//    Staging (ROOT_DOMAIN=stg.*) responde `X-Robots-Tag: noindex`.
// 2) Gate de borde para /app/* (admin tenant) y /platform/* (super-admin):
//    SOLO chequeo BARATO de presencia de cookie (sin DB). La autorización REAL
//    la hace el gate server-side del layout. Inyectamos `x-pathname` para
//    reconstruir el `next` si la validación falla.
//
// Cookies SEPARADAS: contan2_session (tenant) vs contan2_admin_session
// (plataforma). Nunca se mezclan; cada área mira solo la suya.

import { NextResponse, type NextRequest } from 'next/server';
import { getRequestHost, isMarketingHost, isWwwHost } from './lib/marketing/host';

const SESSION_COOKIE = 'contan2_session';
const ADMIN_COOKIE = 'contan2_admin_session';
const LANDING_CACHE = 'public, s-maxage=300, stale-while-revalidate=86400';

export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const host = getRequestHost(req.headers) ?? req.nextUrl.hostname.toLowerCase();
  const root = (process.env.ROOT_DOMAIN ?? 'localhost').toLowerCase();
  const staging = root.startsWith('stg.');

  const done = (res: NextResponse): NextResponse => {
    if (staging) res.headers.set('x-robots-tag', 'noindex');
    return res;
  };
  const redirectTo = (path: string, status?: 307 | 308): NextResponse => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = '';
    return done(NextResponse.redirect(url, status));
  };

  // ── www.<root> → raíz (308, conserva ruta y query) ─────────────────────────
  if (isWwwHost(host, root)) {
    const target = `https://${root.split(':')[0]}${pathname}${search}`;
    return done(NextResponse.redirect(target, 308));
  }

  // ── Raíz '/' por host ──────────────────────────────────────────────────────
  if (pathname === '/') {
    if (host.startsWith('admin.')) return redirectTo('/platform');
    if (isMarketingHost(host, root)) {
      const url = req.nextUrl.clone();
      url.pathname = '/landing';
      const res = NextResponse.rewrite(url);
      res.headers.set('Cache-Control', LANDING_CACHE);
      return done(res);
    }
    return redirectTo('/login'); // raíz de un tenant = puerta del equipo
  }

  // ── /landing directo: la URL pública es '/' ────────────────────────────────
  if (pathname === '/landing') {
    return isMarketingHost(host, root) ? redirectTo('/', 308) : redirectTo('/login');
  }

  // ── Área del PLATFORM ADMIN ────────────────────────────────────────────────
  if (pathname.startsWith('/platform')) {
    // Login y BFF son públicos (el login inicia la sesión).
    if (pathname === '/platform/login' || pathname.startsWith('/platform/api/')) {
      return done(NextResponse.next());
    }
    if (!req.cookies.has(ADMIN_COOKIE)) return redirectTo('/platform/login');
    const headers = new Headers(req.headers);
    headers.set('x-pathname', pathname + search);
    return done(NextResponse.next({ request: { headers } }));
  }

  // ── Área del ADMIN de TENANT (/app/*) ──────────────────────────────────────
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname + search); // se sanea al consumirlo
    return done(NextResponse.redirect(url));
  }

  const headers = new Headers(req.headers);
  headers.set('x-pathname', pathname + search);
  return done(NextResponse.next({ request: { headers } }));
}

export const config = {
  matcher: [
    '/',
    '/landing',
    '/app/:path*',
    '/platform/:path*',
    // www.* → raíz (308) para CUALQUIER ruta salvo assets de Next. El host se
    // evalúa en el matcher (regex); el dominio exacto lo valida el proxy.
    { source: '/((?!_next/).*)', has: [{ type: 'host', value: 'www\\..+' }] },
  ],
};
