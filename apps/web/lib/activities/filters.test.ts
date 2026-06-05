import { describe, it, expect } from 'vitest';
import type { Activity } from './demoData';
import { filterActivities, deriveStatusPills, uniqueCategories, EMPTY_FILTERS } from './filters';

// `now` y fechas RELATIVAS a now en hora LOCAL → deterministas en cualquier tz.
const now = new Date('2026-05-24T12:00:00');
function rel(days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const A: Activity[] = [
  { id: 'hoy', title: 'Cine de hoy', category: 'Cine', date: 'x', startsAt: rel(0), location: 'Sala', status: 'live', statusLabel: 'En curso', registered: 5, capacity: 10, occupancyPct: 50 },
  { id: 'futura', title: 'Concierto futuro', category: 'Concierto', date: 'x', startsAt: rel(2), location: 'Auditorio', status: 'soon', statusLabel: 'Próxima', registered: 1, capacity: 10, occupancyPct: 10 },
  { id: 'pasada', title: 'Taller pasado', category: 'Taller', date: 'x', startsAt: rel(-3), location: 'Sala', status: 'done', statusLabel: 'Finalizada', registered: 8, capacity: 10, occupancyPct: 80 },
  { id: 'pasada2', title: 'Exposición vieja', category: 'Exposición', date: 'x', startsAt: rel(-10), location: 'Galería', status: 'done', statusLabel: 'Finalizada', registered: 9, capacity: 10, occupancyPct: 90 },
  { id: 'borrador', title: 'Borrador sin fecha', category: 'Otro', date: 'Sin fecha', startsAt: null, location: 'CCB', status: 'draft', statusLabel: 'Borrador', registered: null, capacity: null, occupancyPct: null },
];
const ids = (xs: Activity[]) => xs.map((a) => a.id).sort();

describe('filterActivities', () => {
  it('todas → set completo', () => {
    expect(filterActivities(A, EMPTY_FILTERS, now)).toHaveLength(5);
  });
  it('búsqueda por título/lugar/categoría (case-insensitive)', () => {
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, query: 'cine' }, now))).toEqual(['hoy']);
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, query: 'GALERÍA' }, now))).toEqual(['pasada2']);
  });
  it('filtro por estado', () => {
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, status: 'done' }, now))).toEqual(['pasada', 'pasada2']);
  });
  it('filtro por categoría', () => {
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, category: 'Cine' }, now))).toEqual(['hoy']);
  });
  it('fecha: próximas / pasadas / hoy (sin fecha solo en todas)', () => {
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, date: 'proximas' }, now))).toEqual(['futura', 'hoy']);
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, date: 'pasadas' }, now))).toEqual(['pasada', 'pasada2']);
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, date: 'hoy' }, now))).toEqual(['hoy']);
    // 'borrador' (sin fecha) nunca aparece con un filtro de fecha activo
    expect(filterActivities(A, { ...EMPTY_FILTERS, date: 'pasadas' }, now).some((a) => a.id === 'borrador')).toBe(false);
  });
  it('combinación: categoría + fecha', () => {
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, category: 'Taller', date: 'pasadas' }, now))).toEqual(['pasada']);
  });
});

describe('deriveStatusPills / uniqueCategories', () => {
  it('pills: Todas + estados presentes con label real y conteos del scoped', () => {
    const pills = deriveStatusPills(A, A);
    expect(pills[0]).toEqual({ key: 'todas', label: 'Todas', count: 5 });
    const done = pills.find((p) => p.key === 'done');
    expect(done).toEqual({ key: 'done', label: 'Finalizada', count: 2 });
  });
  it('uniqueCategories ordenadas', () => {
    expect(uniqueCategories(A)).toEqual(['Cine', 'Concierto', 'Exposición', 'Otro', 'Taller']);
  });
});
