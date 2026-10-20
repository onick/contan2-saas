import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PuertaStatsResponse } from '@contan2/contracts';
import { PuertaStats } from './PuertaStats';

const DATA = {
  range: { from: '2026-10-01', to: '2026-10-16' }, prevRange: { from: '2026-09-15', to: '2026-09-30' },
  salas: [{ id: 'vr', name: 'Sala VR', aforo: 10, kind: 'vr' }],
  kpis: { people: 41, entries: 8, identified: 6, groupPeople: 2 }, prev: { people: 5, entries: 4, identified: 3, groupPeople: 1 },
  deltas: { people: 100, entries: 100, identified: 100, groupPeople: 100 },
  daily: [], bySala: [], composition: [], byHour: [], byWeekday: [], groups: [],
  bookings: { scheduled: 0, confirmed: 0, attended: 0, noShow: 0, cancelled: 0, peopleExpected: 0, attendedPct: null },
} as unknown as PuertaStatsResponse;

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PuertaStats · error al refrescar (PUE-A10)', () => {
  const OTHER = { ...DATA, kpis: { ...DATA.kpis, people: 77 } } as PuertaStatsResponse;

  it('si el refresco responde 500, avisa con las cifras viejas marcadas y «Reintentar» recupera', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => OTHER });
    vi.stubGlobal('fetch', fetchMock);
    render(<PuertaStats initial={DATA} initialRange={DATA.range} />);
    await user.click(screen.getByRole('button', { name: 'Sala VR' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/No pudimos actualizar las cifras/);
    expect(alert).toHaveTextContent(/datos de las \d{2}:\d{2}/);
    expect(document.querySelector('[data-count="41"]')).not.toBeNull(); // cifra vieja, no la del filtro nuevo
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-count="77"]')).not.toBeNull();
  });

  it('un fallo de red (fetch rechazado) también avisa', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<PuertaStats initial={DATA} initialRange={DATA.range} />);
    await user.click(screen.getByRole('button', { name: 'Sala VR' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos actualizar/);
  });
});
