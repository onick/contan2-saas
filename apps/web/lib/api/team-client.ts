'use client';

// apps/web/lib/api/team-client.ts · fns cliente para las acciones de equipo
// (cambiar rol / activar-suspender). Pegan same-origin al BFF (/app/equipo/api/...),
// que reenvía a api-v2 (árbitro de los invariantes RBAC). Devuelven Result.

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

type Mutation = { id: string; role?: string; status?: string };

async function patch(url: string, body: unknown): Promise<Result<Mutation>> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, error: 'No pudimos conectar. Intentá de nuevo.' };
  }
  const b = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: (b as { error?: string }).error ?? 'No se pudo completar la acción.' };
  return { ok: true, data: b as Mutation };
}

export const changeTeamRole = (id: string, role: string) =>
  patch(`/app/equipo/api/${encodeURIComponent(id)}/role`, { role });
export const changeTeamStatus = (id: string, status: string) =>
  patch(`/app/equipo/api/${encodeURIComponent(id)}/status`, { status });
