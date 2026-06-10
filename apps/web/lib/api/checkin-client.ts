// apps/web/lib/api/checkin-client.ts · fetchers CLIENT de la consola de check-in.
// Pegan same-origin a las BFF (/app/check-in/api/*) y validan la respuesta con los
// contratos. Devuelven un Result honesto (ok/data | ok:false/error) → la UI nunca
// cae a demo. searchVisitors soporta AbortSignal (descartar respuestas obsoletas).

import {
  CheckinMetricsResponseSchema,
  CheckinActivitiesResponseSchema,
  CheckinVisitorsResponseSchema,
  AdminCheckinResponseSchema,
  AdminAnonymousCheckinResponseSchema,
  AttendanceListResponseSchema,
  type CheckinMetricsResponse,
  type CheckinActivitiesResponse,
  type CheckinVisitorsResponse,
  type AdminCheckinResponse,
  type AdminAnonymousCheckinResponse,
  type AdminCheckinRequest,
  type AttendanceListResponse,
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

async function postJson<S extends ZodTypeAny>(url: string, body: unknown, schema: S, headers?: Record<string, string>): Promise<Result<z.infer<S>>> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, error: 'Sin conexión. Reintentá.' };
  }
  let parsed: { error?: string } | unknown = null;
  try { parsed = await res.json(); } catch { /* */ }
  if (!res.ok) return { ok: false, status: res.status, error: (parsed as { error?: string })?.error ?? 'No pudimos registrar.' };
  try {
    return { ok: true, data: schema.parse(parsed) };
  } catch {
    return { ok: false, status: res.status, error: 'Respuesta inválida del servidor.' };
  }
}

export const getCheckinMetrics = (signal?: AbortSignal): Promise<Result<CheckinMetricsResponse>> =>
  getJson('/app/check-in/api/metrics', CheckinMetricsResponseSchema, signal);
export const getCheckinActivities = (signal?: AbortSignal): Promise<Result<CheckinActivitiesResponse>> =>
  getJson('/app/check-in/api/activities', CheckinActivitiesResponseSchema, signal);
export const searchCheckinVisitors = (q: string, signal?: AbortSignal): Promise<Result<CheckinVisitorsResponse>> =>
  getJson(`/app/check-in/api/visitors?q=${encodeURIComponent(q)}&limit=12`, CheckinVisitorsResponseSchema, signal);
// Feed de recepción: registros de HOY (medianoche local del operador), recientes primero.
export const getRecentCheckins = (signal?: AbortSignal): Promise<Result<AttendanceListResponse>> => {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  return getJson(`/app/check-in/api/recent?limit=8&dateFrom=${encodeURIComponent(midnight.toISOString())}`, AttendanceListResponseSchema, signal);
};

export const postCheckin = (body: AdminCheckinRequest): Promise<Result<AdminCheckinResponse>> =>
  postJson('/app/check-in/api/checkin', body, AdminCheckinResponseSchema);
export const postCheckinAnonymous = (activityId: string, idempotencyKey: string): Promise<Result<AdminAnonymousCheckinResponse>> =>
  postJson('/app/check-in/api/anonymous', { activityId }, AdminAnonymousCheckinResponseSchema, { 'idempotency-key': idempotencyKey });
