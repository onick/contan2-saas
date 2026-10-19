import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PeriodSummaryResponse } from '@contan2/contracts';
import { ReportesDashboard } from './ReportesDashboard';

const DATA = {
  range: { from: '2026-10-01', to: '2026-10-16' },
  prevRange: { from: '2026-09-15', to: '2026-09-30' },
  kpis: { activities: 4, attendances: 238, uniqueVisitors: 197, occupancyPct: 48 },
  prev: { activities: 7, attendances: 521, uniqueVisitors: 448, occupancyPct: 58 },
  deltas: { activities: -43, attendances: -54, uniqueVisitors: -56, occupancyPct: -17 },
  byType: [{ type: 'cine', label: 'Cine', attendances: 180, pct: 76 }],
  topActivities: [], newVsReturning: { nuevos: 1, recurrentes: 1 },
  daily: [{ label: '1 oct', current: 1, previous: 1, visitors: 1, activities: 1 }], byHour: [], byWeekday: [],
} as unknown as PeriodSummaryResponse;

const CATS = [{ category: 'Cine Club', activities: 3 }, { category: 'Tertulias', activities: 2 }];

type Handler = (url: string) => Response | Promise<Response>;
function stubFetch(download: Handler) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    calls.push(String(url));
    if (String(url).includes('/api/categories')) return new Response(JSON.stringify({ categories: CATS }), { status: 200 });
    if (String(url).includes('/api/summary')) return new Response(JSON.stringify(DATA), { status: 200 });
    return download(String(url));
  }));
  return calls;
}
const okFile = () => new Response(new Blob(['x']), { status: 200, headers: { 'content-disposition': 'attachment; filename="informe.pdf"' } });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

const renderDash = (filters?: { preset: string | null; types: string[]; categories: string[] }) =>
  render(<ReportesDashboard initial={DATA} initialRange={DATA.range} canExport initialFilters={filters} />);
const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Otros formatos de exportación' }));
  return screen.findByRole('dialog', { name: 'Descargas' });
};

describe('Panel «Descargas»', () => {
  it('el gatillo abre el panel (aria-expanded) con las tres filas', async () => {
    stubFetch(okFile);
    const user = userEvent.setup();
    renderDash();
    const t = screen.getByRole('button', { name: 'Otros formatos de exportación' });
    expect(t).toHaveAttribute('aria-haspopup', 'dialog');
    const panel = await openPanel(user);
    expect(t).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getByRole('heading', { name: 'Informe del período' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Un ciclo o categoría' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Registro mensual' })).toBeInTheDocument();
    expect(within(panel).getByText(/No usa el período de arriba/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument(); // sin matchMedia (móvil): Sheet
  });

  it('en ≥ lg se abre como Popover (no Sheet) y Escape lo cierra devolviendo el foco al gatillo', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('1024'), addEventListener() {}, removeEventListener() {}, media: q }));
    stubFetch(okFile);
    const user = userEvent.setup();
    renderDash();
    const panel = await openPanel(user);
    expect(within(panel).queryByRole('button', { name: 'Cerrar' })).toBeNull(); // el Sheet sí trae «Cerrar»
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descargas' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Otros formatos de exportación' })).toHaveFocus();
  });

  it('los href de «Informe del período» llevan período + tipos + ciclos (el CSV también)', async () => {
    stubFetch(okFile);
    const user = userEvent.setup();
    renderDash({ preset: null, types: ['cine', 'taller'], categories: ['Cine Club', 'Tertulias'] });
    const panel = await openPanel(user);
    const q = (name: string) => new URL(within(panel).getByRole('link', { name }).getAttribute('href')!, 'http://x');
    const pdf = q('PDF · Informe del período');
    expect(pdf.pathname).toBe('/app/reportes/api/period');
    expect(pdf.searchParams.get('kind')).toBe('pdf');
    expect(pdf.searchParams.get('from')).toBe('2026-10-01');
    expect(pdf.searchParams.get('types')).toBe('cine,taller');
    expect(pdf.searchParams.get('categories')).toBe('Cine Club,Tertulias');
    expect(q('Excel · Informe del período').searchParams.get('kind')).toBe('xlsx');
    const csv = q('CSV · Informe del período');
    expect(csv.pathname).toBe('/app/reportes/api/attendance');
    expect(csv.searchParams.get('format')).toBe('csv');
    expect(csv.searchParams.get('types')).toBe('cine,taller');
    expect(csv.searchParams.get('categories')).toBe('Cine Club,Tertulias');
    // CSV habilitado aunque haya tipos y varios ciclos (REP-A17).
    expect(within(panel).getByRole('link', { name: 'CSV · Informe del período' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('«Un ciclo»: deshabilitado hasta elegir; con un solo ciclo arriba lo toma; arma href con category', async () => {
    stubFetch(okFile);
    const user = userEvent.setup();
    renderDash();
    let panel = await openPanel(user);
    await waitFor(() => expect(within(panel).getByRole('combobox', { name: 'Ciclo o categoría' })).toBeEnabled());
    expect(within(panel).getByRole('link', { name: 'PDF · Un ciclo' })).toHaveAttribute('aria-disabled', 'true');
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Ciclo o categoría' }), 'Tertulias');
    const href = within(panel).getByRole('link', { name: 'Excel · Un ciclo' }).getAttribute('href')!;
    const u = new URL(href, 'http://x');
    expect(u.searchParams.get('category')).toBe('Tertulias');
    expect(u.searchParams.get('format')).toBe('xlsx');
    expect(u.searchParams.get('from')).toBe('2026-10-01');
    cleanup();

    stubFetch(okFile);
    renderDash({ preset: null, types: [], categories: ['Cine Club'] });
    panel = await openPanel(user);
    await waitFor(() => expect(within(panel).getByRole('combobox', { name: 'Ciclo o categoría' })).toHaveValue('Cine Club'));
    expect(within(panel).getByRole('link', { name: 'PDF · Un ciclo' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('«Registro mensual»: mes por defecto = hoy en Santo Domingo (no el reloj del navegador), sin meses futuros', async () => {
    // 31 oct 22:00 en RD = 1 nov 02:00 UTC: el navegador (UTC) diría noviembre.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T02:00:00Z'));
    stubFetch(okFile);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDash();
    const panel = await openPanel(user);
    expect(within(panel).getByRole('combobox', { name: 'Mes' })).toHaveValue('10');
    expect(within(panel).getByRole('combobox', { name: 'Año' })).toHaveValue('2026');
    expect(within(panel).queryByRole('option', { name: 'Noviembre' })).toBeNull();
    expect(within(panel).getByRole('link', { name: 'Excel · Registro mensual' })).toHaveAttribute('href', '/app/reportes/api/month?year=2026&month=10');
    expect(within(panel).getByRole('link', { name: 'Excel · Libro anual' })).toHaveAttribute('href', '/app/reportes/api/year?year=2026');
    // Un año pasado permite los 12 meses.
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Año' }), '2025');
    expect(within(panel).getByRole('option', { name: 'Diciembre' })).toBeInTheDocument();
  });

  it('descargar: estado «Generando…» mientras espera, luego vuelve; no navega', async () => {
    let release!: (r: Response) => void;
    const calls = stubFetch(() => new Promise<Response>((res) => { release = res; }));
    const user = userEvent.setup();
    renderDash();
    const panel = await openPanel(user);
    await user.click(within(panel).getByRole('link', { name: 'Excel · Informe del período' }));
    const busy = await within(panel).findByRole('link', { name: 'Generando Excel · Informe del período' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveTextContent('Generando…');
    // las demás quedan bloqueadas mientras tanto
    expect(within(panel).getByRole('link', { name: 'PDF · Informe del período' })).toHaveAttribute('aria-disabled', 'true');
    release(okFile());
    await waitFor(() => expect(within(panel).getByRole('link', { name: 'Excel · Informe del período' })).not.toHaveAttribute('aria-busy'));
    expect(calls.some((u) => u.includes('kind=xlsx'))).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Descarga lista: informe.pdf');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un 429 muestra un aviso legible en la página (sin navegar) y cierra el panel', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'Demasiados reportes en poco tiempo. Espera un momento.' }), { status: 429 }));
    const user = userEvent.setup();
    renderDash();
    const panel = await openPanel(user);
    await user.click(within(panel).getByRole('link', { name: 'PDF · Informe del período' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Demasiados reportes en poco tiempo. Espera un momento.');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descargas' })).toBeNull());
    await user.click(within(alert).getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('el «Descargar PDF» del encabezado también baja en la página y muestra «Generando…»', async () => {
    let release!: (r: Response) => void;
    stubFetch(() => new Promise<Response>((res) => { release = res; }));
    const user = userEvent.setup();
    renderDash();
    await user.click(screen.getByRole('link', { name: 'Descargar PDF' }));
    expect(await screen.findByRole('button', { name: 'Generando…' })).toBeDisabled();
    release(okFile());
    await waitFor(() => expect(screen.getByRole('link', { name: 'Descargar PDF' })).toBeInTheDocument());
  });

  it('ciclos que no cargan: aviso con Reintentar (error ≠ lista vacía) dentro de «Un ciclo»', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => (
      String(url).includes('/api/categories') ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(DATA), { status: 200 })
    )));
    const user = userEvent.setup();
    renderDash();
    const panel = await openPanel(user);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No pudimos cargar los ciclos');
    expect(within(panel).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(within(panel).queryByText(/Todavía no hay actividades con ciclo/)).toBeNull();
  });

  it('403 al pedir ciclos: «sin permiso» sin Reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => (
      String(url).includes('/api/categories') ? new Response('{}', { status: 403 }) : new Response(JSON.stringify(DATA), { status: 200 })
    )));
    const user = userEvent.setup();
    renderDash();
    const panel = await openPanel(user);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No tienes permiso para ver los ciclos');
    expect(within(panel).queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });
});
