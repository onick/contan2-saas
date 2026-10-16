import { forwardingHeaders } from '../../../../lib/api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Cuerpo de petición inválido.' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/auth/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await forwardingHeaders()),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      { error: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return Response.json({ error: data.error ?? 'Algo salió mal en el registro.' }, { status: upstream.status });
  }

  // Paso 1: solo devuelve { ok, email } — no hay redirect todavía
  return Response.json({ ok: true, email: data.email });
}
