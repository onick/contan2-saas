import { describe, it, expect } from 'vitest';
import { reportsQuery, periodHref, attendanceHref, monthHref, defaultReportFilters, filtersToSearch, parseReportFilters } from './filters';

const TODAY = '2026-10-16';

describe('parseReportFilters', () => {
  it('sin params: Este mes sobre el hoy dado', () => {
    expect(parseReportFilters(undefined, TODAY)).toEqual(defaultReportFilters(TODAY));
    expect(defaultReportFilters(TODAY)).toEqual({ range: { from: '2026-10-01', to: '2026-10-16' }, preset: 'mes', types: [], categories: [] });
  });

  it('rango válido con atajo coincidente', () => {
    const f = parseReportFilters({ from: '2026-09-01', to: '2026-09-30', preset: 'mesPasado' }, TODAY);
    expect(f).toMatchObject({ range: { from: '2026-09-01', to: '2026-09-30' }, preset: 'mesPasado' });
  });

  it('atajo que no coincide con el rango: se deduce o queda Personalizado', () => {
    expect(parseReportFilters({ from: '2026-09-01', to: '2026-09-30', preset: 'mes' }, TODAY).preset).toBe('mesPasado');
    expect(parseReportFilters({ from: '2026-09-02', to: '2026-09-30', preset: 'mes' }, TODAY).preset).toBeNull();
    expect(parseReportFilters({ from: '2026-09-02', to: '2026-09-30', preset: 'inventado' }, TODAY).preset).toBeNull();
  });

  it.each([
    ['no YMD', { from: '2026-9-1', to: '2026-09-30' }],
    ['fecha imposible', { from: '2026-02-30', to: '2026-03-05' }],
    ['from > to', { from: '2026-10-10', to: '2026-10-01' }],
    ['más de 366 días', { from: '2025-01-01', to: '2026-10-16' }],
    ['falta una', { from: '2026-10-01' }],
  ])('rango inválido (%s): cae a Este mes', (_n, sp) => {
    expect(parseReportFilters(sp, TODAY)).toEqual(defaultReportFilters(TODAY));
  });

  it('tipos: descarta desconocidos; categorías: lista acotada', () => {
    const f = parseReportFilters({ types: 'cine,hack,taller', categories: 'Cine Club, Arte & Terapia' }, TODAY);
    expect(f.types).toEqual(['cine', 'taller']);
    expect(f.categories).toEqual(['Cine Club', 'Arte & Terapia']);
  });

  it('filtersToSearch es canónico', () => {
    expect(filtersToSearch({ range: { from: '2026-09-01', to: '2026-09-30' }, preset: 'mesPasado', types: ['cine'], categories: ['Cine Club'] }))
      .toBe('from=2026-09-01&to=2026-09-30&preset=mesPasado&types=cine&categories=Cine+Club');
  });
});

describe('hrefs de descarga', () => {
  const base = { from: '2026-10-01', to: '2026-10-16', types: [] as string[], categories: [] as string[] };
  const q = (href: string) => new URL(href, 'http://x');

  it('reportsQuery arma from/to y omite filtros vacíos', () => {
    expect(reportsQuery('2026-10-01', '2026-10-16')).toBe('from=2026-10-01&to=2026-10-16');
    expect(reportsQuery('2026-10-01', '2026-10-16', ['cine'], ['A', 'B'])).toBe('from=2026-10-01&to=2026-10-16&types=cine&categories=A%2CB');
  });

  it('periodHref: pdf/xlsx llevan rango, tipos y ciclos', () => {
    const u = q(periodHref('pdf', { ...base, types: ['cine'], categories: ['Cine Club'] }));
    expect(u.pathname).toBe('/app/reportes/api/period');
    expect(u.searchParams.get('kind')).toBe('pdf');
    expect(u.searchParams.get('types')).toBe('cine');
    expect(u.searchParams.get('categories')).toBe('Cine Club');
  });

  it('attendanceHref csv: sin filtros solo rango + format, siempre habilitado (REP-A17)', () => {
    expect(attendanceHref('csv', base)).toBe('/app/reportes/api/attendance?from=2026-10-01&to=2026-10-16&format=csv');
  });

  it('attendanceHref csv: respeta tipos y VARIOS ciclos (misma semántica que el dashboard)', () => {
    const u = q(attendanceHref('csv', { ...base, types: ['cine', 'taller'], categories: ['A', 'B'] }));
    expect(u.searchParams.get('format')).toBe('csv');
    expect(u.searchParams.get('types')).toBe('cine,taller');
    expect(u.searchParams.get('categories')).toBe('A,B');
    expect(u.searchParams.get('category')).toBeNull();
  });

  it('attendanceHref con un ciclo elegido en el panel: category + filtros de tipo', () => {
    const u = q(attendanceHref('pdf', { ...base, types: ['cine'], category: 'Cine & Café' }));
    expect(u.searchParams.get('category')).toBe('Cine & Café');
    expect(u.searchParams.get('types')).toBe('cine');
    expect(u.searchParams.get('categories')).toBeNull();
  });

  it('monthHref', () => {
    expect(monthHref(2026, 10)).toBe('/app/reportes/api/month?year=2026&month=10');
  });
});
