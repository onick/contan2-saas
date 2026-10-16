// app/api/contact/route.ts · proxy same-origin → api-v2 POST /api/v2/contact.
// Acepta JSON (el fetch del script inline y el modal) y formularios nativos
// (application/x-www-form-urlencoded o multipart/form-data, el respaldo sin JS).
// api-v2 aplica rate-limit + honeypot + envía emails vía Resend. Público (sin
// cookie); sólo reenvía host + IP para que api-v2 resuelva tenant y aplique
// rate-limit por IP real.
//
//  · JSON            → relay verbatim de status/body (camino original).
//  · Formulario      → se valida con ContactRequestSchema y se responde 303 a
//                      /contacto/enviado o /contacto/error?motivo=… (sin PII).
//                      Honeypot (`fax`) lleno → se responde como éxito sin
//                      reenviar nada a api-v2.

import { ContactRequestSchema } from '@contan2/contracts';
import { forwardingHeaders } from '../../../lib/api/forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

const FIELDS = ['name', 'organization', 'email', 'message', 'fax'] as const;

function see(path: string): Response {
  return new Response(null, { status: 303, headers: { location: path, 'cache-control': 'no-store' } });
}
const fail = (motivo: 'datos' | 'limite' | 'servidor'): Response => see(`/contacto/error?motivo=${motivo}`);

async function postUpstream(payload: string): Promise<Response> {
  return fetch(`${API_BASE_URL}/api/v2/contact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await forwardingHeaders()) },
    body: payload,
    cache: 'no-store',
  });
}

async function handleForm(req: Request): Promise<Response> {
  let data: FormData;
  try {
    data = await req.formData();
  } catch {
    return fail('datos');
  }
  // Sólo los campos conocidos (el schema es strict); los archivos se ignoran.
  const raw: Record<string, string> = {};
  for (const k of FIELDS) {
    const v = data.get(k);
    if (typeof v === 'string') raw[k] = v;
  }
  // Honeypot: un humano no lo ve. Se responde como éxito para no dar pistas.
  if ((raw.fax ?? '').trim() !== '') return see('/contacto/enviado');

  const parsed = ContactRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('datos');

  let upstream: Response;
  try {
    upstream = await postUpstream(JSON.stringify(parsed.data));
  } catch {
    return fail('servidor');
  }
  if (upstream.ok) return see('/contacto/enviado');
  if (upstream.status === 429) return fail('limite');
  return fail(upstream.status >= 500 ? 'servidor' : 'datos');
}

export async function POST(req: Request): Promise<Response> {
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    return handleForm(req);
  }

  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await postUpstream(body);
  } catch {
    return Response.json(
      { error: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' },
      { status: 502 },
    );
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
