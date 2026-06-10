// app/api/credentials/[file]/route.ts · proxy del PNG público de credencial en la
// ruta LEGACY de v1 (/api/credentials/CODE.png). Los emails ya enviados por v1
// enlazan esta URL: tras el cutover (web-v2 en el dominio del tenant) debe seguir
// viva → continuidad de credenciales. Valida el nombre LOCALMENTE y streamea desde
// api-v2 (misma ruta legacy, que resuelve tenant por x-forwarded-host). Sólo
// GET/HEAD; relaya únicamente headers seguros; jamás cookies.

import { forwardingHeaders } from '../../../../lib/api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const FILE_RE = /^[A-Za-z]{2,6}-[A-Za-z0-9]{6}\.png$/;
const ALLOWED_HEADERS = ['content-type', 'content-length', 'cache-control', 'content-disposition', 'x-content-type-options'];

async function handle(file: string, method: 'GET' | 'HEAD'): Promise<Response> {
  if (!FILE_RE.test(file)) return new Response(null, { status: 404 });
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/credentials/${encodeURIComponent(file)}`, {
      method,
      headers: await forwardingHeaders(),
      cache: 'no-store',
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  const headers = new Headers();
  for (const h of ALLOWED_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
}

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params;
  return handle(file, 'GET');
}

export async function HEAD(_req: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params;
  return handle(file, 'HEAD');
}
