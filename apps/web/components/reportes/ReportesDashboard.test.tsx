import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
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

const DATA = {
  range: { from: '2026-10-01', to: '2026-10-16' },
  prevRange: { from: '2026-09-15', to: '2026-09-30' },
  kpis: { activities: 4, attendances: 238, uniqueVisitors: 197, occupancyPct: 48 },
  prev: { activities: 7, attendances: 521, uniqueVisitors: 448, occupancyPct: 58 },
  deltas: { activities: -43, attendances: -54, uniqueVisitors: -56, occupancyPct: -17 },
  byType: [{ type: 'cine', label: 'Cine', attendances: 180, pct: 76 }, { type: 'conferencia', label: 'Conferencia', attendances: 58, pct: 24 }],
  topActivities: [
    { id: 'a1', name: 'Cine Dominicano', type: 'cine', attendances: 80, occupancyPct: 53, imageUrl: null },
    { id: 'a2', name: 'Conferencia Arte', type: 'conferencia', attendances: 58, occupancyPct: 40, imageUrl: null },
  ],
  newVsReturning: { nuevos: 67, recurrentes: 130 },
  daily: Array.from({ length: 5 }, (_, i) => ({ label: `${i + 1} oct`, current: 40 + i, previous: 30 + i, visitors: 20 + i, activities: 2 })),
  byHour: [{ hour: 19, count: 52 }, { hour: 20, count: 30 }],
  byWeekday: [{ weekday: 6, count: 55 }, { weekday: 0, count: 40 }],
} as unknown as PeriodSummaryResponse;

const catsFetch = (cats: unknown[] = []) => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: cats }) });

describe('ReportesDashboard · solo lectura vs export', () => {
  it('canExport=false: muestra KPIs y gráficas, sin descargas ni Asistente ni filas clicables', () => {
    vi.stubGlobal('fetch', catsFetch());
    render(<ReportesDashboard initial={DATA} initialRange={DATA.range} canExport={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText('Visitantes únicos').length).toBeGreaterThan(0);
    expect(screen.getByText('Evolución de asistencias')).toBeInTheDocument();
    expect(screen.queryByText(/Descargar PDF/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Otros formatos de exportación' })).toBeNull();
    expect(screen.queryByText(/Asistente/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Abrir informe de/ })).toBeNull();
  });

  it('canExport=true: «Descargar PDF» (enlace con el período) + gatillo del panel + Asistente; sin tarjetas de formulario', () => {
    vi.stubGlobal('fetch', catsFetch());
    render(<ReportesDashboard initial={DATA} initialRange={DATA.range} canExport />);
    expect(screen.getByRole('link', { name: /Descargar PDF/ })).toHaveAttribute('href', expect.stringContaining('kind=pdf'));
    const t = screen.getByRole('button', { name: 'Otros formatos de exportación' });
    expect(t).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Asistente/)).toBeInTheDocument();
    expect(screen.queryByText(/Reporte por ciclo o categoría/)).toBeNull();
    expect(screen.queryByText(/Reporte mensual/)).toBeNull();
    expect(screen.queryByLabelText('Actividad a analizar')).toBeNull();
  });
});

describe('ReportesDashboard · cuerpo reorganizado', () => {
  it('orden: Resumen → Evolución + Por tipo → Actividades destacadas + Visitantes → Cuándo viene la gente', () => {
    vi.stubGlobal('fetch', catsFetch());
    render(<ReportesDashboard initial={DATA} initialRange={DATA.range} canExport />);
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim());
    expect(heads).toEqual(['Resumen del período', 'Evolución de asistencias', 'Por tipo de actividad', 'Actividades destacadas', 'Visitantes', 'Cuándo viene la gente']);
  });

  it('los 4 KPIs viven en UNA tarjeta, 2×2 en móvil y 4 columnas en lg, con celdas de al menos 72 px', () => {
    vi.stubGlobal('fetch', catsFetch());
    const { container } = render(<ReportesDashboard initial={DATA} initialRange={DATA.range} canExport />);
    const grid = container.querySelector('dl')!;
    expect(grid.className).toContain('grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
    const cells = Array.from(grid.children) as HTMLElement[];
    expect(cells).toHaveLength(4);
    for (const c of cells) expect(c.className).toMatch(/min-h-\[(7[2-9]|[89]\d)px\]/);
  });

  it('«Por hora» / «Por día» comparten una tarjeta con control segmentado', () => {
    vi.stubGlobal('fetch', catsFetch());
    render(<ReportesDashboard initial={DATA} initialRange={DATA.range} canExport />);
    expect(screen.getByRole('button', { name: 'Por hora' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('19h')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Por día' }));
    expect(screen.getByRole('button', { name: 'Por día' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Sáb')).toBeInTheDocument();
  });

  it('sin asistencias no hay dona ni «Visitantes» ni «Cuándo»: se ocultan las gráficas vacías', () => {
    vi.stubGlobal('fetch', catsFetch());
    const d = { ...DATA, kpis: { ...DATA.kpis, attendances: 0 }, byType: [], newVsReturning: { nuevos: 0, recurrentes: 0 }, byHour: [], byWeekday: [] } as PeriodSummaryResponse;
    render(<ReportesDashboard initial={d} initialRange={d.range} canExport />);
    expect(screen.queryByText('Por tipo de actividad')).toBeNull();
    expect(screen.queryByText('Visitantes')).toBeNull();
    expect(screen.queryByText('Cuándo viene la gente')).toBeNull();
    expect(screen.getByText('Evolución de asistencias')).toBeInTheDocument();
  });

  it('período sin actividad: estado vacío con acción; «Ver este mes» pide el resumen de este mes', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => (
      String(url).includes('/api/summary') ? { ok: true, json: async () => DATA } : { ok: true, json: async () => ({ categories: [] }) }
    ));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReportesDashboard initial={EMPTY} initialRange={{ from: '2025-01-01', to: '2025-01-07' }} canExport
      initialFilters={{ preset: null, types: [], categories: [] }} />);
    expect(screen.getByText(/Sin actividad entre/)).toBeInTheDocument();
    expect(screen.queryByText('Evolución de asistencias')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver este mes' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => /\/api\/summary\?from=\d{4}-\d{2}-01&/.test(String(u)))).toBe(true));
  });

  it('vacío con filtros activos: ofrece «Quitar filtros»', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => (
      String(url).includes('/api/summary') ? { ok: true, json: async () => EMPTY } : { ok: true, json: async () => ({ categories: [] }) }
    ));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReportesDashboard initial={EMPTY} initialRange={{ from: '2025-01-01', to: '2025-01-07' }} canExport
      initialFilters={{ preset: null, types: ['cine'], categories: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => /\/api\/summary\?from=2025-01-01&to=2025-01-07$/.test(String(u)))).toBe(true));
    expect(screen.queryByLabelText('Filtros activos')).toBeNull();
  });

  it('cargando: aria-busy y KPIs en skeleton', async () => {
    let release!: (v: unknown) => void;
    const slow = new Promise((r) => { release = r; });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/api/summary')) { await slow; return { ok: true, json: async () => DATA }; }
      return { ok: true, json: async () => ({ categories: [{ category: 'Cine Club', activities: 3 }] }) };
    }));
    const { container } = render(<ReportesDashboard initial={DATA} initialRange={DATA.range} canExport />);
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Todos los ciclos' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Cine Club/ }));
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeNull());
    expect(container.querySelector('dl [data-count]')).toBeNull();
    release(null);
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    expect(container.querySelector('dl [data-count]')).not.toBeNull();
  });

  it('una fila de «Actividades destacadas» abre el informe de la actividad con PDF y Excel', async () => {
    vi.stubGlobal('fetch', catsFetch());
    render(<ReportesDashboard initial={DATA} initialRange={DATA.range} canExport />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir informe de Cine Dominicano' }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toHaveTextContent('Cine Dominicano');
    expect(within(dlg).getByRole('link', { name: 'PDF · Informe de la actividad' })).toHaveAttribute('href', '/app/reportes/api/activity/a1.pdf');
    expect(within(dlg).getByRole('link', { name: 'Excel · Informe de la actividad' })).toHaveAttribute('href', '/app/reportes/api/activity/a1.xlsx');
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
