import { describe, it, expect } from 'vitest';
import type { Activity } from './demoData';
import { filterActivities, deriveStatusPills, uniqueCategories, EMPTY_FILTERS, rangeFromParams } from './filters';

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
  it('fecha: próximas / pasadas (sin fecha solo en todas)', () => {
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, date: 'proximas' }, now))).toEqual(['futura', 'hoy']);
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, date: 'pasadas' }, now))).toEqual(['pasada', 'pasada2']);
    // 'borrador' (sin fecha) nunca aparece con un filtro de fecha activo
    expect(filterActivities(A, { ...EMPTY_FILTERS, date: 'pasadas' }, now).some((a) => a.id === 'borrador')).toBe(false);
  });
  it('combinación: categoría + fecha', () => {
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, category: 'Taller', date: 'pasadas' }, now))).toEqual(['pasada']);
  });
});

describe('filtro por rango de días (zona America/Santo_Domingo)', () => {
  const at = (id: string, startsAt: string | null): Activity =>
    ({ id, title: id, category: 'X', date: 'x', startsAt, location: 'S', status: 'soon', statusLabel: 'Próxima', registered: null, capacity: null, occupancyPct: null });
  // RD = UTC-4 todo el año. 2026-10-16T03:59Z = 15 oct 23:59 RD; 04:00Z = 16 oct 00:00 RD.
  const B = [
    at('antes', '2026-10-15T03:59:00Z'), // 14 oct 23:59 RD
    at('abre', '2026-10-15T04:00:00Z'), // 15 oct 00:00 RD
    at('medio', '2026-10-16T15:00:00Z'),
    at('cierra', '2026-10-17T03:59:00Z'), // 16 oct 23:59 RD
    at('despues', '2026-10-17T04:00:00Z'), // 17 oct 00:00 RD
    at('sinfecha', null),
  ];
  const range = { from: '2026-10-15', to: '2026-10-16' };
  const nowB = new Date('2026-10-16T16:00:00Z');

  it('es inclusivo en ambos extremos y respeta el borde de medianoche en RD', () => {
    expect(ids(filterActivities(B, { ...EMPTY_FILTERS, range }, nowB))).toEqual(['abre', 'cierra', 'medio']);
  });
  it('una actividad sin startsAt queda fuera del rango (pero entra sin rango)', () => {
    expect(filterActivities(B, { ...EMPTY_FILTERS, range }, nowB).some((a) => a.id === 'sinfecha')).toBe(false);
    expect(filterActivities(B, EMPTY_FILTERS, nowB)).toHaveLength(6);
  });
  it('un solo día (from = to)', () => {
    expect(ids(filterActivities(B, { ...EMPTY_FILTERS, range: { from: '2026-10-16', to: '2026-10-16' } }, nowB))).toEqual(['cierra', 'medio']);
  });
  it('proximas/pasadas siguen funcionando sin rango y se combinan (AND) con él', () => {
    expect(ids(filterActivities(A, { ...EMPTY_FILTERS, date: 'proximas', range: null }, now))).toEqual(['futura', 'hoy']);
    expect(ids(filterActivities(B, { ...EMPTY_FILTERS, date: 'pasadas', range }, new Date('2026-10-16T16:00:00Z')))).toEqual(['abre']);
  });
});

describe('rangeFromParams', () => {
  const n = new Date('2026-10-16T16:00:00Z'); // viernes 16 oct en RD
  it('from/to válidos', () => expect(rangeFromParams('2026-10-01', '2026-10-05', null, n)).toEqual({ from: '2026-10-01', to: '2026-10-05' }));
  it('inválidos o invertidos → null', () => {
    expect(rangeFromParams('2026-10-09', '2026-10-05', null, n)).toBeNull();
    expect(rangeFromParams('hola', '2026-10-05', null, n)).toBeNull();
    expect(rangeFromParams('2026-10-01', null, null, n)).toBeNull();
  });
  it('compat: fecha=hoy y fecha=semana (lunes..domingo)', () => {
    expect(rangeFromParams(null, null, 'hoy', n)).toEqual({ from: '2026-10-16', to: '2026-10-16' });
    expect(rangeFromParams(null, null, 'semana', n)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(rangeFromParams(null, null, 'proximas', n)).toBeNull();
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
