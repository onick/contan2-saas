// apps/web/middleware.ts · gate de borde para /app/* (admin tenant) y
// /platform/* (super-admin de plataforma).
//
// SOLO chequeo BARATO de presencia de cookie (sin DB). La autorización REAL la
// hace el gate server-side del layout (/auth/me, /platform/auth/me). Acá
// inyectamos `x-pathname` para reconstruir el `next` si la validación falla.
//
// Cookies SEPARADAS: contan2_session (tenant) vs contan2_admin_session
// (plataforma). Nunca se mezclan; cada área mira solo la suya.

import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'contan2_session';
const ADMIN_COOKIE = 'contan2_admin_session';

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  // ── Área del PLATFORM ADMIN ────────────────────────────────────────────────
  if (pathname.startsWith('/platform')) {
    // Login y BFF son públicos (el login inicia la sesión).
    if (pathname === '/platform/login' || pathname.startsWith('/platform/api/')) {
      return NextResponse.next();
    }
    if (!req.cookies.has(ADMIN_COOKIE)) {
      const url = req.nextUrl.clone();
      url.pathname = '/platform/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
    const headers = new Headers(req.headers);
    headers.set('x-pathname', pathname + search);
    return NextResponse.next({ request: { headers } });
  }

  // ── Área del ADMIN de TENANT (/app/*) ──────────────────────────────────────
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname + search); // se sanea al consumirlo
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
  headers.set('x-pathname', pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/app/:path*', '/platform/:path*'],
};
