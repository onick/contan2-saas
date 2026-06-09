// apps/web/lib/api/profile-client.ts · fetchers CLIENT del perfil de visitante.
// Pegan same-origin a las BFF (/app/usuarios/api/[code]/*) y validan con los
// contratos. Result honesto (ok/data | ok:false/error) → la UI nunca cae a demo.

import {
  UserDetailResponseSchema, UserActivityHistoryResponseSchema, UserAffinityResponseSchema,
  type UserDetailResponse, type UserActivityHistoryResponse, type UserAffinityResponse,
} from '@contan2/contracts';
import type { ZodTypeAny, z } from 'zod';

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function getJson<S extends ZodTypeAny>(url: string, schema: S, signal?: AbortSignal): Promise<Result<z.infer<S>>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', ...(signal ? { signal } : {}) });
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw e; // el caller descarta
    return { ok: false, status: 0, error: 'Sin conexión. Reintentá.' };
  }
  let body: { error?: string } | unknown = null;
  try { body = await res.json(); } catch { /* sin JSON */ }
  if (!res.ok) return { ok: false, status: res.status, error: (body as { error?: string })?.error ?? 'Error del servidor.' };
  try {
    return { ok: true, data: schema.parse(body) };
  } catch {
    return { ok: false, status: res.status, error: 'Respuesta inválida del servidor.' };
  }
}

const base = (code: string) => `/app/usuarios/api/${encodeURIComponent(code)}`;

export const getUserDetail = (code: string, signal?: AbortSignal): Promise<Result<UserDetailResponse>> =>
  getJson(`${base(code)}/detail`, UserDetailResponseSchema, signal);

export const getUserActivities = (code: string, limit: number, offset: number, signal?: AbortSignal): Promise<Result<UserActivityHistoryResponse>> =>
  getJson(`${base(code)}/activities?limit=${limit}&offset=${offset}`, UserActivityHistoryResponseSchema, signal);

export const getUserAffinity = (code: string, signal?: AbortSignal): Promise<Result<UserAffinityResponse>> =>
  getJson(`${base(code)}/affinity`, UserAffinityResponseSchema, signal);
