// components/reportes/ReportsAgent.test.tsx · Asistente de Reportes: abre el
// drawer, sugiere acciones, envía consultas al BFF y renderiza cada kind
// (KPIs de período, comparación con deltas, links de descarga, clarify).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ReportsAgent } from './ReportsAgent';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const J = (status: number, obj: unknown) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

const kpis = (n: number) => ({ activities: n, attendances: n * 10, uniqueVisitors: n * 5, occupancyPct: 40 });

const compareBody = {
  kind: 'period_compare',
  message: 'Comparación de julio 2026 contra junio 2026 — las asistencias subieron 25%.',
  compare: {
    a: { label: 'julio 2026', from: '2026-07-01', to: '2026-07-31', kpis: kpis(10) },
    b: { label: 'junio 2026', from: '2026-06-01', to: '2026-06-30', kpis: kpis(8) },
    deltas: { activities: 25, attendances: 25, uniqueVisitors: 25, occupancyPct: 0 },
  },
  links: [
    { label: 'PDF de julio 2026', type: 'period', format: 'pdf', params: { from: '2026-07-01', to: '2026-07-31' } },
  ],
};

const reportBody = {
  kind: 'period_report',
  message: 'Listo — julio 2026: 10 actividades…',
  period: { label: 'julio 2026', from: '2026-07-01', to: '2026-07-31', kpis: kpis(10) },
  links: [
    { label: 'Informe PDF', type: 'period', format: 'pdf', params: { from: '2026-07-01', to: '2026-07-31' } },
    { label: 'Registro mensual (formato del departamento)', type: 'month', format: 'xlsx', params: { year: '2026', month: '7' } },
  ],
};

function installFetch(body: unknown = compareBody) {
  const fn = vi.fn(async (_url: string, _init?: { method?: string; body?: string }) => J(200, body));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function openDrawer() {
  render(<ReportsAgent />);
  fireEvent.click(screen.getByRole('button', { name: /asistente/i }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
}

describe('ReportsAgent', () => {
  it('abre el drawer con sugerencias y manda la consulta al BFF', async () => {
    const fetchMock = installFetch();
    await openDrawer();
    expect(screen.getByText('Asistente de reportes')).toBeTruthy();
    // Chip de sugerencia → dispara la consulta.
    fireEvent.click(screen.getByRole('button', { name: 'Compara este mes con el mes anterior' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/app/reportes/api/agent', expect.objectContaining({ method: 'POST' })));
    const payload = JSON.parse(fetchMock.mock.calls[0]![1]!.body!);
    expect(payload.query).toBe('Compara este mes con el mes anterior');
  });

  it('renderiza la comparación de períodos con deltas y links', async () => {
    installFetch(compareBody);
    await openDrawer();
    const input = screen.getByLabelText('Consulta para el asistente de reportes');
    fireEvent.change(input, { target: { value: 'compara julio con junio' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText(/las asistencias subieron 25%/)).toBeTruthy());
    // Tabla A/B con valores y delta; link de descarga al BFF de período.
    expect(screen.getByText('julio 2026')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy(); // attendances A (10*10)
    const link = screen.getByRole('link', { name: /PDF de julio 2026/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/app/reportes/api/period?kind=pdf&from=2026-07-01&to=2026-07-31');
  });

  it('renderiza el reporte de período con KPIs y el link del registro mensual', async () => {
    installFetch(reportBody);
    await openDrawer();
    const input = screen.getByLabelText('Consulta para el asistente de reportes');
    fireEvent.change(input, { target: { value: 'reporte de julio' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText('Visitantes únicos')).toBeTruthy());
    const month = screen.getByRole('link', { name: /Registro mensual/ }) as HTMLAnchorElement;
    expect(month.getAttribute('href')).toBe('/app/reportes/api/month?year=2026&month=7');
  });

  it('clarify: las opciones re-consultan al tocarlas', async () => {
    const fetchMock = installFetch({
      kind: 'clarify', message: '¿Cuál querés?',
      options: [{ label: 'Concierto Estrella (2026-03-10)', query: '¿Cómo le fue a Concierto Estrella?' }],
    });
    await openDrawer();
    const input = screen.getByLabelText('Consulta para el asistente de reportes');
    fireEvent.change(input, { target: { value: 'estrella' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText('¿Cuál querés?')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Concierto Estrella \(2026-03-10\)/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const second = JSON.parse(fetchMock.mock.calls[1]![1]!.body!);
    expect(second.query).toBe('¿Cómo le fue a Concierto Estrella?');
  });

  it('error del server → mensaje de error en el hilo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => J(429, { error: 'Demasiadas consultas seguidas. Esperá un momento.' })));
    await openDrawer();
    const input = screen.getByLabelText('Consulta para el asistente de reportes');
    fireEvent.change(input, { target: { value: 'reporte de julio' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText(/Demasiadas consultas/)).toBeTruthy());
  });
});
