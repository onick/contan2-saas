// apps/web/lib/api/scanner.ts · capa SERVER del scanner (proxy + gate).
//
// El navegador NUNCA habla directo con api-v2 (interno). Estos helpers corren en
// route handlers / Server Components: reenvían la cookie firmada del scanner
// (scanner_session) y el host del tenant (x-forwarded-host) hacia api-v2, y
// relayan status / body / Set-Cookie de vuelta al navegador same-origin. Sólo
// toca el slice del scanner y el check-in público; cero lógica de negocio acá.

import { cookies, headers } from 'next/headers';
import { apiGet } from './client';
import { PublicActivitiesResponseSchema } from '@contan2/contracts';
import { formatKioskDate } from './kiosko';
import type { ScannerActivity } from '../scanner/types';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SCANNER_COOKIE = 'scanner_session';

async function baseHeaders(forwardScannerCookie: boolean): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const host = (await headers()).get('host');
  if (host) out['x-forwarded-host'] = host;
  if (forwardScannerCookie) {
    const token = (await cookies()).get(SCANNER_COOKIE)?.value;
    if (token) out.cookie = `${SCANNER_COOKIE}=${token}`;
  }
  return out;
}

export interface ProxyInit {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  forwardScannerCookie?: boolean;
}

// Proxy genérico web→api-v2. Relaya status, body JSON y Set-Cookie (la cookie
// scanner_session que emite/borra api-v2 se reenvía tal cual al navegador, que
// la guarda host-only para el origin web). Si api-v2 no responde → 502.
export async function proxyToApiV2(init: ProxyInit): Promise<Response> {
  const reqHeaders = await baseHeaders(init.forwardScannerCookie ?? false);
  if (init.body !== undefined) reqHeaders['content-type'] = 'application/json';

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}${init.path}`, {
      method: init.method,
      headers: reqHeaders,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      { error: 'No pudimos conectar con el servidor. Intenta de nuevo.' },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  const res = new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
  for (const c of upstream.headers.getSetCookie()) res.headers.append('set-cookie', c);
  return res;
}

// Gate server-side: ¿la cookie scanner_session es válida para ESTE tenant?
// Devuelve { orgSlug } o null. Lo usa la página para decidir PIN vs scanner.
export async function getScannerSession(): Promise<{ orgSlug: string } | null> {
  const token = (await cookies()).get(SCANNER_COOKIE)?.value;
  if (!token) return null;
  const host = (await headers()).get('host') ?? undefined;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v2/scanner/me`, {
      headers: {
        cookie: `${SCANNER_COOKIE}=${token}`,
        ...(host ? { 'x-forwarded-host': host } : {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { orgSlug?: string };
    return json.orgSlug ? { orgSlug: json.orgSlug } : null;
  } catch {
    return null;
  }
}

// Actividades públicas reales del tenant para el selector. null si falla (api
// caído / sin host). El scanner NO cae a demo: escribe de verdad, así que un
// fallo se muestra como lista vacía con aviso (no datos inventados).
export async function getScannerActivities(): Promise<ScannerActivity[] | null> {
  try {
    const { activities } = await apiGet('/api/v2/public/activities', PublicActivitiesResponseSchema);
    return activities.map((a) => ({
      id: a.id,
      name: a.name,
      location: a.location,
      dateLabel: formatKioskDate(a.date),
      capacity: a.capacity,
      enrolledCount: a.enrolledCount,
    }));
  } catch {
    return null;
  }
}
