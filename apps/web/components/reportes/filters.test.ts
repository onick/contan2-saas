import { describe, it, expect } from 'vitest';
import { buildCsvExport, defaultReportFilters, filtersToSearch, parseReportFilters } from './filters';

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

describe('buildCsvExport', () => {
  const base = { from: '2026-10-01', to: '2026-10-16', types: [], cats: [] as string[] };
  it('sin filtros: rango + format=csv, habilitado', () => {
    expect(buildCsvExport(base)).toEqual({ href: '/app/reportes/api/attendance?from=2026-10-01&to=2026-10-16&format=csv', disabled: false });
  });
  it('un solo ciclo: agrega category (codificado) y sigue habilitado', () => {
    const r = buildCsvExport({ ...base, cats: ['Cine & Café'] });
    expect(r.disabled).toBe(false);
    expect(new URL(r.href, 'http://x').searchParams.get('category')).toBe('Cine & Café');
  });
  it('varios ciclos o tipos seleccionados: deshabilitado (el CSV no los respeta)', () => {
    expect(buildCsvExport({ ...base, cats: ['A', 'B'] }).disabled).toBe(true);
    expect(buildCsvExport({ ...base, cats: ['A', 'B'] }).href).not.toContain('category=');
    expect(buildCsvExport({ ...base, types: ['cine'] }).disabled).toBe(true);
  });
});
