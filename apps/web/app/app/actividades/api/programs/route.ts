// BFF de Programas/Ciclos → api-v2 /programs.
//   GET  ?year=YYYY  · lista activos + edición derivada (para el dropdown de alta/edición)
//   POST             · alta rápida (name + cíclico + ancla)
import { proxyAuth } from '../../../../../lib/api/auth-proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const search = new URL(req.url).search;
  return proxyAuth('GET', `/api/v2/programs${search}`, undefined, true);
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  return proxyAuth('POST', '/api/v2/programs', body, true);
}
