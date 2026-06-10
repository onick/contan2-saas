// apps/web/lib/api/activities-edit.ts · proxies server-side de ESCRITURA para
// EDITAR una actividad y CAMBIAR su estado. Mismo principio que activities-create:
// el navegador NUNCA llama a api-v2 directo; el form (client) hace PATCH
// same-origin a /app/actividades/api/[id] (o /status) y estos proxies reenvían a
// api-v2 con la cookie de sesión (contan2_session) + forwarding headers, y relayan
// status + body TAL CUAL. api-v2 es el árbitro (rol owner/admin, Zod, tenant-scope,
// 409 capacidad/transición, 404 cross-tenant). Estos proxies no validan ni
// transforman; sólo reenvían.

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

async function proxyPatch(path: string, body: unknown, netError: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    // Fallo de red hacia api-v2 → 502 (el cliente muestra "reintentá").
    return Response.json({ error: netError }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

// PATCH /api/v2/activities/:id · edición parcial. El body ya viene en forma de
// contrato (sólo campos modificados, fechas en ISO). api-v2 rechaza
// organizationId/enrolledCount/imageUrl/status (.strict → 400).
export function proxyUpdateActivity(id: string, body: unknown): Promise<Response> {
  return proxyPatch(
    `/api/v2/activities/${encodeURIComponent(id)}`,
    body,
    'No pudimos guardar los cambios. Intentá de nuevo.',
  );
}

// PATCH /api/v2/activities/:id/status · cambio de estado ({ status }).
export function proxyUpdateStatus(id: string, body: unknown): Promise<Response> {
  return proxyPatch(
    `/api/v2/activities/${encodeURIComponent(id)}/status`,
    body,
    'No pudimos cambiar el estado. Intentá de nuevo.',
  );
}

// DELETE /api/v2/activities/:id · hard-delete GUARDADO (api-v2 arbitra: 409 si
// tiene asistencias y no está cancelada; 403 operator; 404 cross-tenant). 204.
export async function proxyDeleteActivity(id: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/activities/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos eliminar la actividad. Intentá de nuevo.' }, { status: 502 });
  }
  if (upstream.status === 204) return new Response(null, { status: 204 });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

// GET /api/v2/activities/:id · detalle COMPLETO (description/endDate/imageUrl que
// el listado no proyecta). Reenvía con cookie + forwarded headers y relaya status
// + body. Lo usa el drawer/edición para precarga full-fidelity (Lifecycle A2/B).
export async function proxyGetActivity(id: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/api/v2/activities/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'No pudimos cargar la actividad.' }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
