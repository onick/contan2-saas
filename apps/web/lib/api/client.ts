// apps/web/lib/api/client.ts · cliente server-only para api-v2 (read-only).
//
// Server Components: usa next/headers para reenviar la cookie de sesión de v1
// (contan2_session) → api-v2 valida la sesión de staff y resuelve el tenant.
// En dev el Host hacia api-v2 es localhost:3001 → su dev-fallback resuelve el
// tenant ancla (ccb). Cada respuesta se valida con el schema Zod del contrato
// (@contan2/contracts), así el dato llega tipado. `cache: 'no-store'` →
// dinámico por request (datos por-tenant no se prerenderizan).

import { cookies } from 'next/headers';
import type { ZodType } from 'zod';
import { forwardingHeaders } from './forwarded';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SESSION_COOKIE = 'contan2_session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// GET tipado contra api-v2. Lanza ApiError si la respuesta no es 2xx o no valida
// contra el schema. Los fetchers de cada pantalla capturan y caen a demoData.
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Reenvía host del tenant (x-forwarded-host) + IP real del cliente
  // (x-forwarded-for, verbatim si entra) → ver lib/api/forwarded.ts. fetch
  // (undici) NO deja setear `Host`, por eso van como headers de forwarding.
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}),
      ...(await forwardingHeaders()),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    // Mensaje del server si lo hay ({error}): los consumidores lo muestran al
    // usuario (p. ej. la guía del lookup del kiosko); fallback técnico si no.
    let serverMsg: string | null = null;
    try { serverMsg = ((await res.json()) as { error?: string }).error ?? null; } catch { /* sin JSON */ }
    throw new ApiError(res.status, serverMsg ?? `GET ${path} → ${res.status}`);
  }
  return schema.parse(await res.json());
}
