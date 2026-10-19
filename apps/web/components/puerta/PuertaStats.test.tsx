import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PuertaStatsResponse } from '@contan2/contracts';
import { PuertaStats } from './PuertaStats';

const DATA = {
  range: { from: '2026-10-01', to: '2026-10-16' }, prevRange: { from: '2026-09-15', to: '2026-09-30' },
  salas: [{ id: 'vr', name: 'Sala VR', aforo: 10 }],
  kpis: { people: 10, entries: 8, identified: 6, groupPeople: 2 }, prev: { people: 5, entries: 4, identified: 3, groupPeople: 1 },
  deltas: { people: 100, entries: 100, identified: 100, groupPeople: 100 },
  daily: [], bySala: [], composition: [], byHour: [], byWeekday: [], groups: [],
  bookings: { scheduled: 0, confirmed: 0, attended: 0, noShow: 0, cancelled: 0, peopleExpected: 0, attendedPct: null },
} as unknown as PuertaStatsResponse;

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PuertaStats · exportación (REP-U14)', () => {
  it('«Exportar Excel» es un enlace con el rango y la flecha ofrece el Excel completo (sin enlace suelto de 15 px)', async () => {
    const user = userEvent.setup();
    render(<PuertaStats initial={DATA} initialRange={DATA.range} />);
    expect(screen.getByRole('link', { name: 'Exportar Excel' })).toHaveAttribute('href', '/app/puerta/api/export?from=2026-10-01&to=2026-10-16');
    expect(screen.queryByRole('link', { name: 'Descargar Excel completo' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Más opciones de exportación' }));
    expect(screen.getByRole('menuitem', { name: /Excel completo/ })).toHaveAttribute('href', '/app/puerta/api/export');
  });

  it('las pastillas de sala miden 44 px en móvil', () => {
    render(<PuertaStats initial={DATA} initialRange={DATA.range} />);
    for (const name of ['Ambas salas', 'Sala VR']) expect(screen.getByRole('button', { name }).className).toMatch(/min-h-11/);
  });
});
