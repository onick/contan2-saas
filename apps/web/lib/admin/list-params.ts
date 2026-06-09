// apps/web/lib/admin/list-params.ts · helpers PUROS para los list-views (SSR).
// La URL es la ÚNICA fuente de verdad: page/pageSize/q/cohort/activityId/dateFrom/dateTo.
// Sin estado cliente: la página los parsea de searchParams y arma la query del
// API; los controles (client) sólo reescriben la URL.

import { USER_COHORTS, type UserCohort } from '@contan2/contracts';

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 20;
export const MAX_Q_LEN = 100; // espejo del límite del API

export type Raw = string | string[] | undefined;
const first = (v: Raw): string | undefined => (Array.isArray(v) ? v[0] : v);

// Cohorte de usuarios desde la URL. Tolerante: ausente/desconocido → 'all'.
// Espejo de USER_COHORTS de @contan2/contracts.
export function parseCohort(raw: Raw): UserCohort {
  const s = first(raw);
  return s && (USER_COHORTS as readonly string[]).includes(s) ? (s as UserCohort) : 'all';
}

// page ≥ 1 (default 1). Valores basura → 1.
export function parsePage(raw: Raw): number {
  const n = Number(first(raw));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

// pageSize ∈ {10,20,50,100}; default 20. Fuera del set → default.
export function parsePageSize(raw: Raw): PageSize {
  const n = Number(first(raw));
  return (PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSize) : DEFAULT_PAGE_SIZE;
}

// `q` visible (lo que se muestra en el input). Conserva el texto tal cual.
export function parseQ(raw: Raw): string {
  return first(raw) ?? '';
}

// `q` para el API: trim + colapsa espacios + recorta al máximo. undefined si vacío.
export function qForApi(q: string): string | undefined {
  const t = q.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, MAX_Q_LEN) : undefined;
}

export function parseActivityId(raw: Raw): string | undefined {
  const s = first(raw);
  return s && s.length > 0 ? s : undefined;
}

// Fecha de la URL como `YYYY-MM-DD`. `{value}` si válida, `{invalid:true}` si tiene
// formato pero no es fecha real, `{}` si ausente. La página decide (eliminar de la
// URL / mostrar error) — nunca rompe el render.
export function parseDateParam(raw: Raw): { value?: string; invalid?: true } {
  const s = first(raw);
  if (!s) return {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { invalid: true };
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { invalid: true };
  return { value: s };
}

// Bordes ISO del día (rango inclusivo) para el API a partir de `YYYY-MM-DD`.
export const dayStartIso = (d: string): string => `${d}T00:00:00.000Z`;
export const dayEndIso = (d: string): string => `${d}T23:59:59.999Z`;

export function computeOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

// Query string del API omitiendo params vacíos.
// Filtro de archivado de usuarios (F2D). Default 'active'.
export type UserStatusFilter = 'active' | 'archived' | 'all';
export function parseUserStatus(raw: Raw): UserStatusFilter {
  const s = first(raw);
  return s === 'archived' || s === 'all' ? s : 'active';
}

export interface ApiListParams {
  limit: number;
  offset: number;
  q?: string;
  cohort?: UserCohort; // omitido si 'all'
  status?: UserStatusFilter; // omitido si 'active'
  activityId?: string;
  dateFrom?: string; // ISO completo
  dateTo?: string; // ISO completo
}
export function toApiQuery(p: ApiListParams): string {
  const sp = new URLSearchParams();
  sp.set('limit', String(p.limit));
  sp.set('offset', String(p.offset));
  if (p.q) sp.set('q', p.q);
  if (p.cohort && p.cohort !== 'all') sp.set('cohort', p.cohort);
  if (p.status && p.status !== 'active') sp.set('status', p.status);
  if (p.activityId) sp.set('activityId', p.activityId);
  if (p.dateFrom) sp.set('dateFrom', p.dateFrom);
  if (p.dateTo) sp.set('dateTo', p.dateTo);
  return sp.toString();
}

// searchParams de la página (Record) → URLSearchParams (toma el primer valor de
// los arrays, omite vacíos). Para construir redirects preservando filtros.
export function recordToSearchParams(sp: Record<string, Raw>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v);
    if (val != null && val !== '') out.set(k, val);
  }
  return out;
}

// Reescribe los search params de la URL (client) aplicando un patch. `undefined`
// elimina la key. `resetPage` borra `page` (→ default 1). Omite valores vacíos.
export function patchSearchParams(
  current: URLSearchParams,
  patch: Record<string, string | undefined>,
  opts: { resetPage?: boolean } = {},
): string {
  const next = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') next.delete(k);
    else next.set(k, v);
  }
  if (opts.resetPage) next.delete('page');
  return next.toString();
}
