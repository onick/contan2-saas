// apps/web/middleware.ts · gate de borde para /app/* (admin v2).
//
// SOLO chequeo BARATO de presencia de cookie (sin DB): si no hay
// contan2_session → redirect a /login?next=<ruta>. La autorización REAL
// (sesión válida, tenant correcto, no expirada/cross-tenant) la hace el gate
// server-side del layout vía /auth/me + /org/branding. Acá inyectamos
// `x-pathname` para que ese gate reconstruya el `next` si la validación falla.
//
// El matcher SOLO cubre /app/*: /kiosko, /scanner, /uploads/*, la landing (/) y
// los proxies /api/auth/* quedan FUERA → públicos/intactos.

import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'contan2_session';

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

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
  matcher: ['/app/:path*'],
};
