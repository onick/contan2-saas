// apps/web/lib/api/profile-proxy.ts · proxies server-side del perfil de visitante
// (UI-2). El navegador NUNCA llama a api-v2 directo: el drawer (client) pega
// same-origin a /app/usuarios/api/[code]/* y estos proxies reenvían a api-v2 con la
// cookie de sesión + forwarding headers, relayando status + body TAL CUAL. api-v2
// es el árbitro (rol, tenant-scope, 404). Caído → 502 (UI honesta, nunca demo).

import { cookies } from 'next/headers';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

async function relayGet(path: string, netError: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: netError }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

// PATCH (editar): reenvía cookie + forwarded + body JSON; relay exacto.
async function relayPatch(path: string, body: string, netError: string): Promise<Response> {
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
      body,
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: netError }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' } });
}

const enc = encodeURIComponent;

export const proxyUserDetail = (code: string) =>
  relayGet(`/api/v2/users/${enc(code)}`, 'No pudimos cargar el visitante.');

export const proxyUserUpdate = (code: string, body: string) =>
  relayPatch(`/api/v2/users/${enc(code)}`, body, 'No pudimos guardar los cambios.');

// POST reenviar credencial: reenvía la Idempotency-Key (evita reenvíos por retry).
async function relayPost(path: string, idempotencyKey: string, netError: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
        ...(await forwardingHeaders()),
      },
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: netError }, { status: 502 });
  }
  const text = await upstream.text();
  return new Response(text, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' } });
}

export const proxyUserCredential = (code: string, idempotencyKey: string) =>
  relayPost(`/api/v2/users/${enc(code)}/credential`, idempotencyKey, 'No pudimos reenviar la credencial.');

export const proxyUserActivities = (code: string, search: string) =>
  relayGet(`/api/v2/users/${enc(code)}/activities${search}`, 'No pudimos cargar el historial.');

export const proxyUserAffinity = (code: string) =>
  relayGet(`/api/v2/users/${enc(code)}/affinity`, 'No pudimos cargar los intereses.');
