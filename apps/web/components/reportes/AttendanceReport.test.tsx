import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { AttendanceReport } from './AttendanceReport';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const report = {
  period: { from: '2026-03-01', to: '2026-03-31' },
  totals: { activities: 2, attendances: 3, people: 5, anonymous: 1, capacity: 110, occupancyPct: 5 },
  rows: [
    { activityId: 'a1', name: 'Concierto Jazz', date: '2026-03-15T19:00:00.000Z', location: 'Sala', category: 'Música', status: 'activa', capacity: 100, enrolledCount: 3, attendances: 3, people: 5, anonymous: 1, occupancyPct: 5 },
  ],
};

const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('AttendanceReport', () => {
  it('inicial: descargas deshabilitadas + hint', () => {
    render(<AttendanceReport />);
    expect(screen.getByText(/Elegí un rango y generá/i)).toBeInTheDocument();
    // no hay enlaces de descarga aún (sólo spans deshabilitados)
    expect(screen.queryByRole('link', { name: /CSV/i })).toBeNull();
  });

  it('generar → preview con totales + tabla + descargas con href por formato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(J(200, report));
    vi.stubGlobal('fetch', fetchMock);
    render(<AttendanceReport />);
    fireEvent.click(screen.getByRole('button', { name: /Generar/i }));
    await waitFor(() => expect(screen.getByText('Concierto Jazz')).toBeInTheDocument());
    expect(screen.getByText('3 check-ins')).toBeInTheDocument();
    expect(screen.getByText('5% ocupación')).toBeInTheDocument();
    // las descargas ahora son enlaces con el rango del preview + format
    const csv = screen.getByRole('link', { name: /CSV/i });
    expect(csv.getAttribute('href')).toContain('from=2026-03-01');
    expect(csv.getAttribute('href')).toContain('to=2026-03-31');
    expect(csv.getAttribute('href')).toContain('format=csv');
    expect(screen.getByRole('link', { name: /Excel/i }).getAttribute('href')).toContain('format=xlsx');
    expect(screen.getByRole('link', { name: /PDF/i }).getAttribute('href')).toContain('format=pdf');
  });

  it('403 → mensaje de permiso honesto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(J(403, { error: 'no' })));
    render(<AttendanceReport />);
    fireEvent.click(screen.getByRole('button', { name: /Generar/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No tenés permiso/i));
  });
});
