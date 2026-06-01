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
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} → ${res.status}`);
  }
  return schema.parse(await res.json());
}
