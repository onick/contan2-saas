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

describe('ReportesDashboard · permiso', () => {
  it('canExport=false: estado «sin permiso», sin export ni KPIs y sin pedir /categories', () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    render(<ReportesDashboard initial={EMPTY} initialRange={EMPTY.range} canExport={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/No tienes permiso para ver Reportes/);
    expect(screen.queryByText(/Exportar Excel/)).toBeNull();
    expect(screen.queryByText(/Descargar PDF/)).toBeNull();
    expect(screen.queryByText('Visitantes únicos')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
