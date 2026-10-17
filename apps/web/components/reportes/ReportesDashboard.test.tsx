import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { PeriodSummaryResponse } from '@contan2/contracts';
import { ReportesDashboard } from './ReportesDashboard';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const EMPTY = {
  range: { from: '2026-10-01', to: '2026-10-16' },
  prevRange: { from: '2026-09-15', to: '2026-09-30' },
  kpis: { activities: 0, attendances: 0, uniqueVisitors: 0, occupancyPct: 0 },
  prev: { activities: 0, attendances: 0, uniqueVisitors: 0, occupancyPct: 0 },
  deltas: { activities: 0, attendances: 0, uniqueVisitors: 0, occupancyPct: 0 },
  byType: [], topActivities: [], newVsReturning: { nuevos: 0, recurrentes: 0 },
  daily: [], byHour: [], byWeekday: [],
} as unknown as PeriodSummaryResponse;

describe('ReportesDashboard · solo lectura vs export', () => {
  it('canExport=false: muestra KPIs y gráficas, sin export/Asistente/tarjetas de descarga', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [] }) }));
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText('Visitantes únicos').length).toBeGreaterThan(0);
    expect(screen.getByText('Evolución de asistencias')).toBeInTheDocument();
    expect(screen.queryByText(/Exportar Excel/)).toBeNull();
    expect(screen.queryByText(/Descargar PDF/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Otros formatos de exportación' })).toBeNull();
    expect(screen.queryByText(/Asistente/)).toBeNull();
    expect(screen.queryByText(/Reporte por ciclo o categoría/)).toBeNull();
    expect(screen.queryByText(/Reporte mensual/)).toBeNull();
  });

  it('canExport=true: export, Asistente y tarjetas de descarga', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [] }) }));
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport />);
    expect(screen.getByRole('link', { name: /Descargar PDF/ })).toHaveAttribute('href', expect.stringContaining('kind=pdf'));
    // Excel/CSV viven en el menú del SplitButton: no están al render.
    expect(screen.queryByText(/Exportar Excel/)).toBeNull();
    expect(screen.getByText(/Asistente/)).toBeInTheDocument();
    expect(screen.getByText(/Reporte mensual/)).toBeInTheDocument();
  });

  it('canExport=true: el menú "Otros formatos de exportación" ofrece Excel y CSV (habilitado sin filtros)', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [] }) }));
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Otros formatos de exportación' }), { key: 'Enter' });
    const xlsx = screen.getByRole('menuitem', { name: /Exportar Excel/ });
    expect(xlsx).toHaveAttribute('href', expect.stringContaining('kind=xlsx'));
    const csv = screen.getByRole('menuitem', { name: /Exportar CSV/ });
    expect(csv).toHaveAttribute('href', '/app/reportes/api/attendance?from=2026-10-01&to=2026-10-16&format=csv');
    expect(csv).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('canExport=true: con tipos en la URL el CSV queda deshabilitado con su nota', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [] }) }));
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport initialFilters={{ preset: null, types: ['cine'], categories: [] }} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Otros formatos de exportación' }), { key: 'Enter' });
    expect(screen.getByRole('menuitem', { name: /Exportar CSV/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('No aplica filtros de tipo ni varios ciclos')).toBeInTheDocument();
  });

  it('canExport=true: con un solo ciclo el CSV lleva category', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [] }) }));
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport initialFilters={{ preset: null, types: [], categories: ['Cine Club'] }} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Otros formatos de exportación' }), { key: 'Enter' });
    expect(screen.getByRole('menuitem', { name: /Exportar CSV/ })).toHaveAttribute('href', expect.stringContaining('category=Cine+Club'));
  });
});

describe('ReportesDashboard · filtro de período (DateRangePicker)', () => {
  const okFetch = () => vi.fn().mockImplementation(async (url: string) => (
    String(url).includes('/api/summary')
      ? { ok: true, json: async () => EMPTY }
      : { ok: true, json: async () => ({ categories: [] }) }
  ));

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T16:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('el trigger dice «Este mes» y no hay inputs de fecha sueltos', () => {
    vi.stubGlobal('fetch', okFetch());
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport />);
    expect(screen.getByRole('button', { name: 'Período: Este mes · 1 – 16 oct 2026' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Desde')).toBeNull();
  });

  it('«Mes pasado» + Aplicar pide el resumen 2026-09-01..2026-09-30 y deja el rango en la URL', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const replace = vi.spyOn(window.history, 'replaceState');
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport />);
    fireEvent.click(screen.getByRole('button', { name: /^Período/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mes pasado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => /\/api\/summary\?from=2026-09-01&to=2026-09-30/.test(String(u)))).toBe(true));
    expect(screen.getByRole('button', { name: 'Período: Mes pasado · 1 – 30 sep 2026' })).toBeInTheDocument();
    const last = String(replace.mock.calls.at(-1)?.[2]);
    expect(last).toContain('from=2026-09-01');
    expect(last).toContain('to=2026-09-30');
    expect(last).toContain('preset=mesPasado');
  });

  it('con ciclos en la URL pide el resumen filtrado al montar', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport
      initialFilters={{ preset: 'mes', types: [], categories: ['Cine Club'] }} />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => /\/api\/summary\?.*categories=Cine\+Club/.test(String(u)))).toBe(true));
  });
});
