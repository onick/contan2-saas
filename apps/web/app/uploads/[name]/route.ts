// app/uploads/[name]/route.ts · proxy de SERVING de portadas (S2). El navegador
// pide `/uploads/<name>` (lo que guarda activities.image_url); este handler valida
// el nombre LOCALMENTE y, si es seguro, hace streaming desde api-v2 `/uploads/<name>`.
// Sólo GET/HEAD. Relaya únicamente headers permitidos; nunca cookies ni headers
// internos. No bufferiza la imagen (stream directo).

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

// Nombre seguro: caracteres válidos + extensión de imagen conocida. Sin `..`, sin
// separadores (ni codificados, ya que Next decodifica el segmento), sin traversal.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(webp|png|jpe?g|gif)$/i;
function isSafeName(name: string): boolean {
  if (!name || name.length > 128) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  return SAFE_NAME.test(name);
}

// Sólo estos headers de respuesta se relayan (nada de set-cookie ni internos).
const ALLOWED_HEADERS = ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified', 'x-content-type-options'];

async function handle(name: string, method: 'GET' | 'HEAD'): Promise<Response> {
  if (!isSafeName(name)) return new Response(null, { status: 404 });
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/uploads/${name}`, { method, cache: 'no-store' });
  } catch {
    return new Response(null, { status: 502 });
  }
  const headers = new Headers();
  for (const h of ALLOWED_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  // HEAD: sin cuerpo. GET: stream directo (sin cargar en memoria).
  return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
}

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }): Promise<Response> {
  const { name } = await ctx.params;
  return handle(name, 'GET');
}

export async function HEAD(_req: Request, ctx: { params: Promise<{ name: string }> }): Promise<Response> {
  const { name } = await ctx.params;
  return handle(name, 'HEAD');
}
