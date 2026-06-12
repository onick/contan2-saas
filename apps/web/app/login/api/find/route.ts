// BFF POST {email} → api-v2 /public/tenant-lookup (sin cookie: el host
// marketing no tiene tenant; relaya status y body tal cual).
import { forwardingHeaders } from '../../../../lib/api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  try {
    const res = await fetch(`${API_BASE_URL}/api/v2/public/tenant-lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await forwardingHeaders()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ error: 'Servicio no disponible. Intentá de nuevo.' }, { status: 502 });
  }
}
