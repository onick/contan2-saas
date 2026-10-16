// apps/web/proxy.test.ts · proxy (ex-middleware): gate de /app y /platform +
// ruteo por host de la raíz (landing estática vs login vs panel de plataforma).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy, config } from './proxy';

const mkReq = (url: string, opts: { cookie?: string; headers?: Record<string, string> } = {}) => {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new NextRequest(url, { headers });
};

const CACHE = 'public, s-maxage=300, stale-while-revalidate=86400';
const loc = (res: Response) => new URL(res.headers.get('location') as string);

let prevRoot: string | undefined;
beforeEach(() => {
  prevRoot = process.env.ROOT_DOMAIN;
  process.env.ROOT_DOMAIN = 'contan2.com';
});
afterEach(() => {
  if (prevRoot === undefined) delete process.env.ROOT_DOMAIN;
  else process.env.ROOT_DOMAIN = prevRoot;
});

describe('proxy /app/*', () => {
  it('sin cookie → redirect a /login con next = ruta solicitada (encoded)', () => {
    const res = proxy(mkReq('https://ccb.contan2.com/app/usuarios?x=1'));
    expect(res.status).toBe(307);
    expect(loc(res).pathname).toBe('/login');
    expect(loc(res).searchParams.get('next')).toBe('/app/usuarios?x=1');
  });

  it('con cookie → deja pasar e inyecta x-pathname para el gate del layout', () => {
    const res = proxy(mkReq('https://ccb.contan2.com/app/actividades', { cookie: 'contan2_session=tok' }));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/app/actividades');
  });
});

describe('proxy /platform/*', () => {
  it('sin cookie de admin → /platform/login', () => {
    const res = proxy(mkReq('https://admin.contan2.com/platform/tenants'));
    expect(res.status).toBe(307);
    expect(loc(res).pathname).toBe('/platform/login');
  });
  it('con cookie de admin → pasa con x-pathname', () => {
    const res = proxy(mkReq('https://admin.contan2.com/platform/tenants?q=1', { cookie: 'contan2_admin_session=tok' }));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/platform/tenants?q=1');
  });
  it('/platform/login es público', () => {
    const res = proxy(mkReq('https://admin.contan2.com/platform/login'));
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('proxy · raíz por host', () => {
  it('contan2.com/ → rewrite a /landing con Cache-Control público', () => {
    const res = proxy(mkReq('https://contan2.com/'));
    expect(res.headers.get('x-middleware-rewrite')).toBe('https://contan2.com/landing');
    expect(res.headers.get('cache-control')).toBe(CACHE);
  });

  it('el host sale de x-forwarded-host cuando existe', () => {
    const res = proxy(mkReq('http://localhost:3000/', { headers: { 'x-forwarded-host': 'contan2.com' } }));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/landing');
  });

  it('x-forwarded-host de tenant gana sobre host marketing → /login', () => {
    const res = proxy(mkReq('https://contan2.com/', { headers: { 'x-forwarded-host': 'ccb.contan2.com' } }));
    expect(res.status).toBe(307);
    expect(loc(res).pathname).toBe('/login');
  });

  it('ccb.contan2.com/ → 307 /login', () => {
    const res = proxy(mkReq('https://ccb.contan2.com/'));
    expect(res.status).toBe(307);
    expect(loc(res).pathname).toBe('/login');
  });

  it('admin.contan2.com/ → 307 /platform', () => {
    const res = proxy(mkReq('https://admin.contan2.com/'));
    expect(res.status).toBe(307);
    expect(loc(res).pathname).toBe('/platform');
  });
});

describe('proxy · www y /landing directo', () => {
  it('www.contan2.com/x → 308 a https://contan2.com/x', () => {
    const res = proxy(mkReq('https://www.contan2.com/x?a=1'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://contan2.com/x?a=1');
  });

  it('contan2.com/landing directo → 308 a /', () => {
    const res = proxy(mkReq('https://contan2.com/landing'));
    expect(res.status).toBe(308);
    expect(loc(res).pathname).toBe('/');
  });

  it('ccb.contan2.com/landing → /login', () => {
    const res = proxy(mkReq('https://ccb.contan2.com/landing'));
    expect(res.status).toBe(307);
    expect(loc(res).pathname).toBe('/login');
  });
});

describe('proxy · staging', () => {
  it('con ROOT_DOMAIN=stg.contan2.com las respuestas llevan x-robots-tag noindex', () => {
    process.env.ROOT_DOMAIN = 'stg.contan2.com';
    const rewrite = proxy(mkReq('https://stg.contan2.com/'));
    expect(rewrite.headers.get('x-robots-tag')).toBe('noindex');
    const app = proxy(mkReq('https://ccb.stg.contan2.com/app/x', { cookie: 'contan2_session=t' }));
    expect(app.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('en producción NO se envía noindex', () => {
    const res = proxy(mkReq('https://contan2.com/'));
    expect(res.headers.get('x-robots-tag')).toBeNull();
  });
});

describe('proxy · matcher', () => {
  const sources = config.matcher.map((m) => (typeof m === 'string' ? m : m.source));

  it('incluye /, /landing, /app/* y /platform/*', () => {
    expect(sources).toEqual(expect.arrayContaining(['/', '/landing', '/app/:path*', '/platform/:path*']));
  });

  it('cubre www.* (host) para el redirect 308 y nunca captura /kiosko ni /_next', () => {
    const www = config.matcher.find((m) => typeof m !== 'string' && m.has?.some((h) => h.type === 'host'));
    expect(www).toBeTruthy();
    const wwwSource = typeof www === 'string' || !www ? '' : www.source;
    const re = new RegExp(`^${wwwSource.replace(/^\//, '/')}$`);
    expect(re.test('/x')).toBe(true);
    expect(re.test('/_next/static/a.js')).toBe(false);
  });

  it('excluye /kiosko (ni las fuentes literales ni la regla de www lo nombran)', () => {
    expect(sources.some((s) => s.startsWith('/kiosko'))).toBe(false);
  });
});
