// app/api/contact/route.ts · proxy same-origin → api-v2 POST /api/v2/contact.
// El modal de la landing envía aquí; api-v2 aplica rate-limit + honeypot + envía
// emails vía Resend. Público (sin cookie); sólo reenvía host + IP para que
// api-v2 resuelva tenant y aplique rate-limit por IP real.

import { forwardingHeaders } from '../../../lib/api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/contact`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(await forwardingHeaders()),
      },
      body,
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      { error: 'No pudimos conectar con el servidor. Intentá de nuevo.' },
      { status: 502 },
    );
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
