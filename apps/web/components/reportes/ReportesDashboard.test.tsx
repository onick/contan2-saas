import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
    expect(screen.queryByText(/Asistente/)).toBeNull();
    expect(screen.queryByText(/Reporte por ciclo o categoría/)).toBeNull();
    expect(screen.queryByText(/Reporte mensual/)).toBeNull();
  });

  it('canExport=true: export, Asistente y tarjetas de descarga', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [] }) }));
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport />);
    expect(screen.getByText(/Exportar Excel/)).toBeInTheDocument();
    expect(screen.getByText(/Descargar PDF/)).toBeInTheDocument();
    expect(screen.getByText(/Asistente/)).toBeInTheDocument();
    expect(screen.getByText(/Reporte mensual/)).toBeInTheDocument();
  });
});
