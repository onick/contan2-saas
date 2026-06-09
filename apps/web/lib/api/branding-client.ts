'use client';

// apps/web/lib/api/branding-client.ts · fn cliente para guardar identidad.
import type { OrgBrandingResponse } from '@contan2/contracts';

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export async function updateBranding(patch: Record<string, unknown>): Promise<Result<OrgBrandingResponse>> {
  let res: Response;
  try {
    res = await fetch('/app/identidad/api/branding', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  } catch {
    return { ok: false, status: 0, error: 'No pudimos conectar. Intentá de nuevo.' };
  }
  const b = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: (b as { error?: string }).error ?? 'No se pudo guardar.' };
  return { ok: true, data: b as OrgBrandingResponse };
}
