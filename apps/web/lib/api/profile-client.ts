// apps/web/lib/api/profile-client.ts · fetchers CLIENT del perfil de visitante.
// Pegan same-origin a las BFF (/app/usuarios/api/[code]/*) y validan con los
// contratos. Result honesto (ok/data | ok:false/error) → la UI nunca cae a demo.

import {
  UserDetailResponseSchema, UserActivityHistoryResponseSchema, UserAffinityResponseSchema,
  AdminCredentialResendResponseSchema,
  type UserDetailResponse, type UserActivityHistoryResponse, type UserAffinityResponse,
  type AdminUserUpdateRequest, type AdminCredentialResendResponse,
} from '@contan2/contracts';
import type { ZodTypeAny, z } from 'zod';

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

// PATCH editar visitante. Devuelve el detalle enriquecido actualizado o un Result
// de error honesto (400 validación, 403 permiso, 409 email duplicado, 502 red).
export async function updateUser(code: string, patch: AdminUserUpdateRequest): Promise<Result<UserDetailResponse>> {
  let res: Response;
  try {
    res = await fetch(`/app/usuarios/api/${encodeURIComponent(code)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, status: 0, error: 'Sin conexión. Reintentá.' };
  }
  let body: { error?: string } | unknown = null;
  try { body = await res.json(); } catch { /* */ }
  if (!res.ok) return { ok: false, status: res.status, error: (body as { error?: string })?.error ?? 'No pudimos guardar.' };
  try { return { ok: true, data: UserDetailResponseSchema.parse(body) }; }
  catch { return { ok: false, status: res.status, error: 'Respuesta inválida del servidor.' }; }
}

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

// Reenviar credencial. `idempotencyKey` DEBE reusarse en reintentos/doble-click
// (misma key → el server replica sin reenviar). Una acción nueva = key nueva.
export async function resendCredential(code: string, idempotencyKey: string): Promise<Result<AdminCredentialResendResponse>> {
  let res: Response;
  try {
    res = await fetch(`${base(code)}/credential`, { method: 'POST', headers: { 'idempotency-key': idempotencyKey } });
  } catch {
    return { ok: false, status: 0, error: 'Sin conexión. Reintentá.' };
  }
  let body: { error?: string } | unknown = null;
  try { body = await res.json(); } catch { /* */ }
  if (!res.ok) return { ok: false, status: res.status, error: (body as { error?: string })?.error ?? 'No pudimos reenviar.' };
  try { return { ok: true, data: AdminCredentialResendResponseSchema.parse(body) }; }
  catch { return { ok: false, status: res.status, error: 'Respuesta inválida del servidor.' }; }
}
