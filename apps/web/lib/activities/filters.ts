// apps/web/lib/activities/filters.ts · filtrado en memoria de Actividades (sin
// API, sin escrituras). Lógica pura → testeable con `now` pineado. La pantalla
// /app/actividades carga el set una vez (server-fetch) y filtra acá en cliente.

import type { Activity, ActivityStatus } from './demoData';

export type StatusFilter = 'todas' | ActivityStatus;
export type DateFilter = 'todas' | 'proximas' | 'pasadas' | 'hoy' | 'semana';
export type CategoryFilter = 'todas' | string;

export interface ActivityFilters {
  query: string;
  status: StatusFilter;
  category: CategoryFilter;
  date: DateFilter;
}

export const EMPTY_FILTERS: ActivityFilters = { query: '', status: 'todas', category: 'todas', date: 'todas' };

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Lunes como inicio de semana (es-DO/ISO). Devuelve [inicio, finExclusivo) en ms.
function weekRange(now: Date): [number, number] {
  const day = now.getDay(); // 0=domingo
  const mondayOffset = (day + 6) % 7; // días desde el lunes
  const monday = startOfDay(now) - mondayOffset * 86_400_000;
  return [monday, monday + 7 * 86_400_000];
}

function matchesDate(a: Activity, date: DateFilter, now: Date): boolean {
  if (date === 'todas') return true;
  if (!a.startsAt) return false; // sin fecha → solo aparece en "todas"
  const t = new Date(a.startsAt).getTime();
  if (Number.isNaN(t)) return false;
  const today = startOfDay(now);
  switch (date) {
    case 'proximas': return t >= today;
    case 'pasadas': return t < today;
    case 'hoy': return t >= today && t < today + 86_400_000;
    case 'semana': {
      const [start, end] = weekRange(now);
      return t >= start && t < end;
    }
    default: return true;
  }
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
