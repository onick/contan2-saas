// apps/web/middleware.test.ts · gate de borde de /app/*.
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, config } from './middleware';

const mkReq = (url: string, cookie?: string) =>
  new NextRequest(url, cookie ? { headers: { cookie } } : undefined);

describe('middleware /app/*', () => {
  it('sin cookie → redirect a /login con next = ruta solicitada (encoded)', () => {
    const res = middleware(mkReq('https://ccb.contan2.com/app/usuarios?x=1'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location') as string);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/app/usuarios?x=1');
  });

  it('con cookie → deja pasar e inyecta x-pathname para el gate del layout', () => {
    const res = middleware(mkReq('https://ccb.contan2.com/app/actividades', 'contan2_session=tok'));
    // NextResponse.next() no redirige (sin location).
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/app/actividades');
  });

  it('el matcher cubre /, /app/* y /platform/* (kiosko/scanner/uploads/api quedan fuera)', () => {
    expect(config.matcher).toEqual(['/', '/app/:path*', '/platform/:path*']);
  });

  it('host admin.* en la raíz → redirect a /platform', () => {
    const res = middleware(new NextRequest('https://admin.contan2.com/'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') as string).pathname).toBe('/platform');
  });

  it('host NO-admin en la raíz → pasa (no redirige a /platform)', () => {
    const res = middleware(new NextRequest('https://contan2.com/'));
    const loc = res.headers.get('location');
    expect(loc === null || !new URL(loc).pathname.startsWith('/platform')).toBe(true);
  });
});
