import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { DashboardOverviewResponse } from '@contan2/contracts';

const metric = (current: number, deltaPct: number) => ({ current, previous: 0, deltaPct });

let data: DashboardOverviewResponse | null;
vi.mock('../../lib/api/dashboard', () => ({ getDashboardOverview: async () => data }));
vi.mock('../../lib/shell/nav', () => ({ PUERTA_ENABLED: true }));
vi.mock('../../lib/auth/demo', () => ({ isDemoFallbackAllowed: () => false }));
vi.mock('./RecentActivity', () => ({ RecentActivity: () => <section aria-label="Actividad reciente (mock)" /> }));
vi.mock('../charts/useDataAnim', () => ({ useDataAnim: () => undefined }));

import { OverviewData } from './OverviewData';

afterEach(cleanup);

const base = (): DashboardOverviewResponse => ({
  period: '30d',
  series: [{ date: '2026-10-01', value: 51 }, { date: '2026-10-02', value: 72 }],
  attendance: { ...metric(430, -6), records: 420 },
  newVisitors: metric(129, -18),
  avgOccupancyPct: metric(32, -26),
  returnRatePct: metric(55, -13),
  upcoming: null,
  featured: null,
  topActivities: [],
  insights: [],
  salasHoy: null,
});

describe('OverviewData', () => {
  it('KPIs: personas + registros en la protagonista oscura, cálida, y dos neutras', async () => {
    data = base();
    const { container } = render(await OverviewData({ period: '30d' }));
    const tones = Array.from(container.querySelectorAll('section[data-tone]')).map((s) => s.getAttribute('data-tone'));
    expect(tones).toEqual(['dark', 'warm', 'neutral', 'neutral']);
    const dark = container.querySelector('section[data-tone="dark"]') as HTMLElement;
    expect(within(dark).getByText('Asistencias del periodo')).toBeInTheDocument();
    expect(within(dark).getByText('430')).toBeInTheDocument();
    expect(within(dark).getByText('(420 registros)')).toBeInTheDocument();
    expect(within(dark).getByText('-6%')).toBeInTheDocument();
    expect(screen.getByText('32%')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
  });

  it('el primer número tras la etiqueta de Asistencias son las personas (contrato ADM-01)', async () => {
    data = base();
    const { container } = render(await OverviewData({ period: 'today' }));
    const dark = container.querySelector('section[data-tone="dark"]') as HTMLElement;
    const after = (dark.textContent ?? '').replace('Asistencias del periodo', '');
    expect(/(-?\d[\d.,]*)/.exec(after)?.[1]).toBe('430');
  });

  it('"Atención hoy" lista los avisos y "Salas hoy" va junto; ambos ausentes si no hay datos', async () => {
    data = {
      ...base(),
      insights: [{ type: 'low_enrollment', severity: 'warning', title: 'Baja inscripción próxima', message: 'Cine 2/50' }],
      salasHoy: { people: 12, entries: 9, salas: [{ id: 's1', name: 'Sala Ada', people: 12 }] },
    };
    const { unmount } = render(await OverviewData({ period: '30d' }));
    expect(screen.getByRole('heading', { name: 'Atención hoy' })).toBeInTheDocument();
    expect(screen.getByText('Baja inscripción próxima')).toBeInTheDocument();
    expect(screen.getByTestId('salas-hoy')).toBeInTheDocument();
    unmount();
    data = base();
    render(await OverviewData({ period: '30d' }));
    expect(screen.queryByText('Atención hoy')).toBeNull();
    expect(screen.queryByTestId('salas-hoy')).toBeNull();
  });

  it('bento: columna izquierda = KPIs grandes → Atención hoy → gráfica; derecha = KPIs compactas → Actividad reciente → Salas hoy', async () => {
    data = {
      ...base(),
      insights: [{ type: 'low_enrollment', severity: 'warning', title: 'Baja inscripción próxima', message: 'Cine 2/50' }],
      salasHoy: { people: 12, entries: 9, salas: [{ id: 's1', name: 'Sala Ada', people: 12 }] },
    };
    const { container } = render(await OverviewData({ period: '30d' }));
    const left = container.querySelector('[data-bento="izquierda"]') as HTMLElement;
    const right = container.querySelector('[data-bento="derecha"]') as HTMLElement;
    // Por debajo de xl las columnas son `contents` (una sola rejilla); a xl, columnas flex.
    for (const col of [left, right]) {
      expect(col.className).toContain('contents');
      expect(col.className).toContain('xl:flex-col');
    }
    expect(within(left).getByText('Asistencias del periodo')).toBeInTheDocument();
    expect(within(left).getByRole('heading', { name: 'Atención hoy' })).toBeInTheDocument();
    expect(within(left).getByRole('heading', { name: 'Asistencias' })).toBeInTheDocument();
    const small = Array.from(right.querySelectorAll('section[data-tone="neutral"]'));
    expect(small).toHaveLength(2);
    for (const s of small) expect(s.getAttribute('data-compact')).toBe('true');
    expect(within(right).getByLabelText('Actividad reciente (mock)')).toBeInTheDocument();
    expect(within(right).getByTestId('salas-hoy')).toBeInTheDocument();
    // Orden: a xl Actividad reciente va ANTES que Salas hoy; por debajo, Salas hoy antes (operativo).
    const recent = within(right).getByLabelText('Actividad reciente (mock)').parentElement!;
    const salas = within(right).getByTestId('salas-hoy').parentElement!;
    expect(recent.className).toContain('xl:order-4');
    expect(salas.className).toContain('xl:order-6');
    expect(recent.className).toContain('order-6');
    expect(salas.className).toContain('order-4');
  });

  it('muestra la gráfica y la actividad reciente', async () => {
    data = base();
    render(await OverviewData({ period: '30d' }));
    expect(screen.getByRole('heading', { name: 'Asistencias' })).toBeInTheDocument();
    expect(screen.getByLabelText('Actividad reciente (mock)')).toBeInTheDocument();
  });

  it('sin datos, estado no disponible', async () => {
    data = null;
    render(await OverviewData({ period: '30d' }));
    expect(screen.getByText('Dashboard no disponible')).toBeInTheDocument();
  });
});
