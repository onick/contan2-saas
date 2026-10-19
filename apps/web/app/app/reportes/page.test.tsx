import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPeriodSummary } from '../../../lib/api/reports';
import { render, screen, cleanup } from '@testing-library/react';
import type { PeriodSummaryResponse } from '@contan2/contracts';
vi.mock('../../../lib/branding/tenant', () => ({
  getTenantBranding: async () => ({
    id: 'local-ccb', slug: 'ccb', name: 'Centro Cultural Banreservas',
    logoUrl: null, emailLogoUrl: null, credentialLogoUrl: null, logoScale: 100,
    primaryColor: '#e65100', secondaryColor: '#ff6f00', sidebarTheme: 'brand',
    status: 'active', plan: 'free', trialEndsAt: null,
  }),
}));
let mockRole = 'admin';
vi.mock('../../../lib/auth/session', () => ({
  getAdminGate: async () => ({ status: 'ok', staff: { id: 's1', role: mockRole } }),
}));
import ReportesPage from './page';

// Reportes · dashboard ejecutivo. La página fetchea el period-summary inicial
// (server-side, mockeado) y renderiza el dashboard rico; cero controles inertes.
vi.mock('../../../components/shell/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../lib/api/reports', async (orig) => {
  const actual = await orig<typeof import('../../../lib/api/reports')>();
  const SAMPLE: PeriodSummaryResponse = {
    range: { from: '2026-06-01', to: '2026-06-13' },
    prevRange: { from: '2026-05-19', to: '2026-05-31' },
    kpis: { activities: 4, attendances: 238, people: 301, uniqueVisitors: 197, occupancyPct: 48 },
    prev: { activities: 7, attendances: 521, people: 640, uniqueVisitors: 448, occupancyPct: 58 },
    deltas: { activities: -43, attendances: -54, people: -53, uniqueVisitors: -56, occupancyPct: -10 },
    byType: [
      { type: 'cine', label: 'Cine', attendances: 180, people: 230, pct: 76 },
      { type: 'conferencia', label: 'Conferencia', attendances: 58, people: 71, pct: 24 },
    ],
    topActivities: [
      { id: 'a1', name: 'Cine Dominicano: Los pasos del tiempo', type: 'cine', attendances: 80, people: 101, occupancyPct: 53, imageUrl: null },
      { id: 'a2', name: 'Conferencia Arte & Terapia', type: 'conferencia', attendances: 58, people: 71, occupancyPct: 40, imageUrl: null },
    ],
    activities: [],
    byMonth: [],
    newVsReturning: { nuevos: 67, recurrentes: 130 },
    daily: Array.from({ length: 13 }, (_, i) => ({ label: `${i + 1} jun`, current: 40 + i, previous: 30 + i, people: 50 + i, previousPeople: 40 + i, visitors: 20 + i, activities: 2 })),
    byHour: [{ hour: 19, count: 52, people: 60 }, { hour: 20, count: 30, people: 36 }],
    byWeekday: [{ weekday: 6, count: 55, people: 66 }, { weekday: 0, count: 40, people: 48 }],
  };
  return { ...actual, getPeriodSummary: vi.fn().mockResolvedValue(SAMPLE) };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); mockRole = 'admin'; });

describe('/app/reportes · dashboard', () => {
  it('renderiza KPIs + paneles del período con datos reales; export con rango vivo', async () => {
    render(await ReportesPage());

    expect(screen.getByRole('heading', { name: 'Reportes' })).toBeInTheDocument();
    // KPIs (los labels también aparecen en "Comparación" → getAllByText)
    expect(screen.getAllByText('Actividades').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Visitantes únicos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('301').length).toBeGreaterThan(0); // PERSONAS: cifra principal (P2)
    expect(screen.getAllByText('238 registros').length).toBeGreaterThan(0); // registros: dato secundario
    expect(screen.getAllByText('10 pp').length).toBeGreaterThan(0); // ocupación: variación en puntos
    // Filtros
    expect(screen.getByText('Este mes')).toBeInTheDocument();
    expect(screen.getByText('Todos los tipos')).toBeInTheDocument();
    // Paneles
    expect(screen.getByText('Evolución de asistencias')).toBeInTheDocument();
    expect(screen.getByText('Distribución por tipo de actividad')).toBeInTheDocument();
    expect(screen.getByText('Top actividades')).toBeInTheDocument();
    expect(screen.getByText('Nuevos vs. recurrentes')).toBeInTheDocument();
    // Export apunta al BFF con rango vivo (no href="#").
    expect(document.querySelectorAll('a[href="#"]')).toHaveLength(0);
    const pdf = screen.getByRole('link', { name: /Descargar PDF/i });
    expect(pdf.getAttribute('href')).toMatch(/\/app\/reportes\/api\/period\?kind=pdf&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  });

  it('puerta (puede generar reportes) ve el dashboard con export', async () => {
    mockRole = 'puerta';
    render(await ReportesPage());
    expect(screen.getByRole('link', { name: /Descargar PDF/i })).toBeInTheDocument();
  });

  it.each(['operator', 'consulta'])('%s: ve el dashboard en SOLO LECTURA (KPIs y gráficas) sin botones de export ni Asistente', async (role) => {
    mockRole = role;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [] }) }));
    render(await ReportesPage());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Evolución de asistencias')).toBeInTheDocument();
    expect(screen.getAllByText('238').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Descargar PDF/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Exportar Excel/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Asistente/i })).toBeNull();
    expect(screen.queryByText(/Reporte por ciclo o categoría/)).toBeNull();
    expect(screen.queryByText(/Reporte mensual \(formato registro\)/)).toBeNull();
  });

  it.each(['protocolo', 'biblioteca'])('%s (confinado): «sin permiso» honesto, sin KPIs ni botones de export', async (role) => {
    mockRole = role;
    render(await ReportesPage());
    expect(screen.getByRole('alert')).toHaveTextContent(/No tienes permiso para ver Reportes/);
    expect(screen.queryByRole('link', { name: /Descargar PDF/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Exportar Excel/i })).toBeNull();
    expect(screen.queryByText('Evolución de asistencias')).toBeNull();
  });

  it('searchParams válidos: el resumen inicial usa ese rango y el trigger lo refleja', async () => {
    render(await ReportesPage({ searchParams: Promise.resolve({ from: '2026-09-01', to: '2026-09-30', preset: 'mesPasado', types: 'cine' }) }));
    expect(getPeriodSummary).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30', ['cine']);
    expect(screen.getByRole('button', { name: 'Período: Mes pasado · 1 – 30 sep 2026' })).toBeInTheDocument();
  });

  it('searchParams inválidos (from>to): cae a Este mes del hoy de Santo Domingo', async () => {
    render(await ReportesPage({ searchParams: Promise.resolve({ from: '2026-09-30', to: '2026-09-01' }) }));
    const [from, to] = vi.mocked(getPeriodSummary).mock.calls.at(-1)!;
    const now = new Date();
    const dr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(now);
    expect(to).toBe(dr);
    expect(from).toBe(`${dr.slice(0, 7)}-01`);
    expect(screen.getByText('Este mes')).toBeInTheDocument();
  });
});
