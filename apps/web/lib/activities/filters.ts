// apps/web/lib/activities/filters.ts · filtrado en memoria de Actividades (sin
// API, sin escrituras). Lógica pura → testeable con `now` pineado. La pantalla
// /app/actividades carga el set una vez (server-fetch) y filtra acá en cliente.

import type { Activity, ActivityStatus } from './demoData';
import { DEFAULT_TZ, addDays, isYmd, startOfWeek, todayYmd, type Ymd, type YmdRange } from '../../components/ui/arc/date-range-picker/ymd';

export type StatusFilter = 'todas' | ActivityStatus;
export type DateFilter = 'todas' | 'proximas' | 'pasadas';
export type CategoryFilter = 'todas' | string;

export interface ActivityFilters {
  query: string;
  status: StatusFilter;
  category: CategoryFilter;
  date: DateFilter;
  // Rango de días (inclusivo, zona del tenant). Si existe, manda sobre el atajo si lo contradice: se combinan (AND).
  range: YmdRange | null;
}

export const EMPTY_FILTERS: ActivityFilters = { query: '', status: 'todas', category: 'todas', date: 'todas', range: null };

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Día calendario de la actividad en la zona del tenant (no la del dispositivo).
function activityDay(a: Activity): Ymd | null {
  if (!a.startsAt) return null;
  const d = new Date(a.startsAt);
  return Number.isNaN(d.getTime()) ? null : todayYmd(DEFAULT_TZ, d);
}

function matchesRange(a: Activity, range: YmdRange | null): boolean {
  if (!range) return true;
  const day = activityDay(a);
  return day !== null && day >= range.from && day <= range.to; // sin fecha → fuera del rango
}

function matchesDate(a: Activity, date: DateFilter, now: Date): boolean {
  if (date === 'todas') return true;
  if (!a.startsAt) return false; // sin fecha → solo aparece en "todas"
  const t = new Date(a.startsAt).getTime();
  if (Number.isNaN(t)) return false;
  const today = startOfDay(now);
  return date === 'proximas' ? t >= today : t < today;
}

/**
 * Rango desde la URL: `from`+`to` válidos (YYYY-MM-DD, from<=to). Compatibilidad con enlaces viejos:
 * `fecha=hoy` → hoy..hoy y `fecha=semana` → lunes..domingo de la semana actual (zona del tenant).
 */
export function rangeFromParams(from: string | null, to: string | null, legacyFecha: string | null, now: Date = new Date()): YmdRange | null {
  if (from && to && isYmd(from) && isYmd(to) && from <= to) return { from, to };
  const today = todayYmd(DEFAULT_TZ, now);
  if (legacyFecha === 'hoy') return { from: today, to: today };
  if (legacyFecha === 'semana') { const mon = startOfWeek(today, 1); return { from: mon, to: addDays(mon, 6) }; }
  return null;
}

function matchesQuery(a: Activity, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [a.title, a.location, a.category, a.statusLabel]
    .some((f) => f.toLowerCase().includes(needle));
}

// Aplica búsqueda + estado + categoría + fecha sobre el set cargado.
export function filterActivities(
  activities: Activity[],
  f: ActivityFilters,
  now: Date = new Date(),
): Activity[] {
  return activities.filter((a) =>
    matchesQuery(a, f.query) &&
    (f.status === 'todas' || a.status === f.status) &&
    (f.category === 'todas' || a.category === f.category) &&
    matchesRange(a, f.range) &&
    matchesDate(a, f.date, now),
  );
}

// Pills de estado derivados del set cargado (auto-adapta etiqueta y modo
// api/demo, porque usa el statusLabel real de cada actividad). Conteos sobre el
// `scoped` (set tras search+categoría+fecha) → conteos "vivos".
export interface StatusPill { key: StatusFilter; label: string; count: number }

export function deriveStatusPills(all: Activity[], scoped: Activity[]): StatusPill[] {
  const order: ActivityStatus[] = ['soon', 'live', 'done', 'draft'];
  const present = order.filter((s) => all.some((a) => a.status === s));
  const labelOf = (s: ActivityStatus) => all.find((a) => a.status === s)?.statusLabel ?? s;
  return [
    { key: 'todas', label: 'Todas', count: scoped.length },
    ...present.map((s) => ({ key: s, label: labelOf(s), count: scoped.filter((a) => a.status === s).length })),
  ];
}

// Categorías únicas del set (para el filtro de categoría), ordenadas alfabéticamente.
export function uniqueCategories(activities: Activity[]): string[] {
  return [...new Set(activities.map((a) => a.category))].sort((x, y) => x.localeCompare(y));
}
