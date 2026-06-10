// apps/web/lib/api/activity-detail.ts · fetch client-side del detalle COMPLETO de
// una actividad (same-origin → BFF GET /app/actividades/api/[id] → api-v2
// GET /api/v2/activities/:id). Valida con el contrato. Lo usan el drawer de detalle
// y el de edición para precarga full-fidelity (description/endDate reales). Devuelve
// un resultado honesto ok/error para distinguir loading/datos/error en la UI.

import { ActivityDetailSchema, ActivitySummaryResponseSchema, type ActivityDetail, type ActivitySummary } from '@contan2/contracts';

export type ActivityDetailResult =
  | { ok: true; detail: ActivityDetail }
  | { ok: false; status: number; error: string };

export async function fetchActivityDetail(id: string): Promise<ActivityDetailResult> {
  let res: Response;
  try {
    res = await fetch(`/app/actividades/api/${encodeURIComponent(id)}`, { cache: 'no-store' });
  } catch {
    return { ok: false, status: 0, error: 'Problema de red al cargar la actividad.' };
  }
  if (res.status !== 200) {
    let body: { error?: string } | null = null;
    try { body = (await res.json()) as { error?: string }; } catch { /* sin JSON */ }
    const msg = res.status === 404
      ? 'La actividad ya no existe o no pertenece a este centro.'
      : res.status === 401
        ? 'Tu sesión expiró. Iniciá sesión de nuevo.'
        : body?.error ?? 'No pudimos cargar la actividad.';
    return { ok: false, status: res.status, error: msg };
  }
  try {
    const detail = ActivityDetailSchema.parse(await res.json());
    return { ok: true, detail };
  } catch {
    return { ok: false, status: 200, error: 'La respuesta del servidor no es válida.' };
  }
}

// Resumen post-evento/en vivo (BFF GET /app/actividades/api/[id]/summary →
// api-v2 /activities/:id/summary). Falla silenciosa en la UI (la sección de
// resumen simplemente no se muestra): por eso devuelve null en vez de error.
export async function fetchActivitySummary(id: string): Promise<ActivitySummary | null> {
  let res: Response;
  try {
    res = await fetch(`/app/actividades/api/${encodeURIComponent(id)}/summary`, { cache: 'no-store' });
  } catch {
    return null;
  }
  if (res.status !== 200) return null;
  try {
    return ActivitySummaryResponseSchema.parse(await res.json()).summary;
  } catch {
    return null;
  }
}
