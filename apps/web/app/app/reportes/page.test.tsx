import { describe, it, expect, vi, afterEach } from 'vitest';
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
    kpis: { activities: 4, attendances: 238, uniqueVisitors: 197, occupancyPct: 48 },
    prev: { activities: 7, attendances: 521, uniqueVisitors: 448, occupancyPct: 58 },
    deltas: { activities: -43, attendances: -54, uniqueVisitors: -56, occupancyPct: -17 },
    byType: [
      { type: 'cine', label: 'Cine', attendances: 180, pct: 76 },
      { type: 'conferencia', label: 'Conferencia', attendances: 58, pct: 24 },
    ],
    topActivities: [
      { id: 'a1', name: 'Cine Dominicano: Los pasos del tiempo', type: 'cine', attendances: 80, occupancyPct: 53, imageUrl: null },
      { id: 'a2', name: 'Conferencia Arte & Terapia', type: 'conferencia', attendances: 58, occupancyPct: 40, imageUrl: null },
    ],
    newVsReturning: { nuevos: 67, recurrentes: 130 },
    daily: Array.from({ length: 13 }, (_, i) => ({ label: `${i + 1} jun`, current: 40 + i, previous: 30 + i, visitors: 20 + i, activities: 2 })),
    byHour: [{ hour: 19, count: 52 }, { hour: 20, count: 30 }],
    byWeekday: [{ weekday: 6, count: 55 }, { weekday: 0, count: 40 }],
  };
  return { ...actual, getPeriodSummary: vi.fn().mockResolvedValue(SAMPLE) };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('/app/reportes · dashboard', () => {
  it('renderiza KPIs + paneles del período con datos reales; export con rango vivo', async () => {
    render(await ReportesPage());

    expect(screen.getByRole('heading', { name: 'Reportes' })).toBeInTheDocument();
    // KPIs (los labels también aparecen en "Comparación" → getAllByText)
    expect(screen.getAllByText('Actividades').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Visitantes únicos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('238').length).toBeGreaterThan(0); // asistencias (KPI + comparación)
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
});
