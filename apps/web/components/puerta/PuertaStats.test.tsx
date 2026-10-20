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

  it('las pastillas de sala miden 44 px en móvil y en tablet (sin bajar a 36 px en sm/md)', () => {
    render(<PuertaStats initial={DATA} initialRange={DATA.range} />);
    for (const name of ['Ambas salas', 'Sala VR']) {
      const cls = screen.getByRole('button', { name }).className;
      expect(cls).toMatch(/min-h-11/);
      expect(cls).not.toMatch(/(sm|md):min-h-(9|10)\b/);
    }
  });

  it('los controles de la cabecera (Registro, Exportar, período) miden 44 px también en tablet', () => {
    render(<PuertaStats initial={DATA} initialRange={DATA.range} />);
    const ctl = [
      screen.getByRole('link', { name: /Registro/ }),
      screen.getByRole('link', { name: 'Exportar Excel' }).closest('[role="group"]')!,
      screen.getByRole('button', { name: /Período/ }),
    ];
    for (const el of ctl) {
      expect(el.className).toMatch(/min-h-11/);
      expect(el.className).toMatch(/md:min-h-11/);
    }
    // La flecha del Excel (40 px de ancho en el kit) sube a 44 px desde el grupo.
    expect(ctl[1]!.className).toMatch(/last-child\]:min-w-11/);
  });
});

describe('PuertaStats · aviso de truncado (REP-A25)', () => {
  it('si las entradas superan la cota del Excel, avisa; si caben, no', () => {
    const over = { ...DATA, kpis: { ...DATA.kpis, entries: 52_000 }, exportRowCap: 50_000 } as PuertaStatsResponse;
    const { unmount } = render(<PuertaStats initial={over} initialRange={over.range} />);
    expect(screen.getByRole('status')).toHaveTextContent(/52[.,]000 entradas.*primeras 50[.,]000/);
    unmount();
    const fits = { ...DATA, exportRowCap: 50_000 } as PuertaStatsResponse;
    render(<PuertaStats initial={fits} initialRange={fits.range} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

