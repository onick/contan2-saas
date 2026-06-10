import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import type { Activity } from '../../lib/activities/demoData';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ACT: Activity = {
  id: 'A1', title: 'Concierto de prueba', category: 'Concierto', date: '10 jun 2026',
  startsAt: '2026-06-10T19:00:00.000Z', location: 'Sala 2', status: 'done', statusLabel: 'Finalizada',
  registered: 80, capacity: 100, occupancyPct: 80, type: 'concierto', statusRaw: 'finalizada',
};

const DETAIL = {
  id: 'A1', name: 'Concierto de prueba', type: 'concierto', location: 'Sala 2',
  date: '2026-06-10T19:00:00.000Z', endDate: null, capacity: 100, enrolledCount: 80,
  status: 'finalizada', description: 'Una descripción', category: 'Concierto', imageUrl: null, imagePosY: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const SUMMARY = {
  totalAttendances: 5, identifiedCount: 4, anonymousCount: 1, occupancyPct: 80,
  newcomers: 2, returning: 2, vipCount: 1, avgPriorAttendances: 2.8, newcomerRatio: 50,
  companionsChildren: 3, peopleInRoom: 8,
};

// GET detalle (sin /summary) → DETAIL; GET /summary → lo que diga el test.
function mockFetch(summary: { status: number; body?: unknown }) {
  const fn = vi.fn().mockImplementation((url: string) => {
    if (String(url).endsWith('/summary')) {
      return Promise.resolve(new Response(JSON.stringify(summary.body ?? {}), { status: summary.status, headers: { 'content-type': 'application/json' } }));
    }
    return Promise.resolve(new Response(JSON.stringify(DETAIL), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('ActivityDetailDrawer · resumen post-evento', () => {
  it('con asistencias: muestra las tarjetas (asistencias/nuevos/habituales/VIPs/anónimos/en sala)', async () => {
    mockFetch({ status: 200, body: { summary: SUMMARY } });
    render(<ActivityDetailDrawer activity={ACT} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Resumen post-evento')).toBeInTheDocument());
    expect(screen.getByText('Asistencias')).toBeInTheDocument();
    expect(screen.getByText('80% ocupación · 1 sin credencial')).toBeInTheDocument();
    expect(screen.getByText('Nuevos visitantes')).toBeInTheDocument();
    expect(screen.getByText('50% de 4 identificados')).toBeInTheDocument();
    expect(screen.getByText('Habituales')).toBeInTheDocument();
    expect(screen.getByText('Prom. 2.8 visitas previas')).toBeInTheDocument();
    expect(screen.getByText('VIPs presentes')).toBeInTheDocument();
    expect(screen.getByText('Personas en sala')).toBeInTheDocument();
    expect(screen.getByText('Incluye 3 niños acompañantes')).toBeInTheDocument();
    expect(screen.getByText('Sin credencial')).toBeInTheDocument();
  });

  it('actividad ACTIVA → el encabezado dice "Resumen en vivo"', async () => {
    mockFetch({ status: 200, body: { summary: { ...SUMMARY, companionsChildren: 0, peopleInRoom: 5, anonymousCount: 0 } } });
    render(<ActivityDetailDrawer activity={{ ...ACT, status: 'live', statusLabel: 'Activa', statusRaw: 'activa' }} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Resumen en vivo')).toBeInTheDocument());
    // sin companions ni anónimos → esas tarjetas no aparecen
    expect(screen.queryByText('Personas en sala')).toBeNull();
    expect(screen.queryByText('Sin credencial')).toBeNull();
  });

  it('sin asistencias (todo cero) o con error de fetch → la sección no aparece', async () => {
    mockFetch({ status: 200, body: { summary: { ...SUMMARY, totalAttendances: 0 } } });
    render(<ActivityDetailDrawer activity={ACT} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Una descripción')).toBeInTheDocument());
    expect(screen.queryByText(/Resumen/)).toBeNull();

    cleanup();
    mockFetch({ status: 500, body: { error: 'x' } });
    render(<ActivityDetailDrawer activity={ACT} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Una descripción')).toBeInTheDocument());
    expect(screen.queryByText(/Resumen/)).toBeNull();
  });

  it('item demo (sin statusRaw) → ni fetch ni sección', () => {
    const fn = mockFetch({ status: 200, body: { summary: SUMMARY } });
    render(<ActivityDetailDrawer activity={{ ...ACT, statusRaw: undefined, type: undefined }} onClose={vi.fn()} />);
    expect(fn).not.toHaveBeenCalled();
    expect(screen.queryByText(/Resumen/)).toBeNull();
  });
});
