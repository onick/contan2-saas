import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import type { Activity } from '../../lib/activities/demoData';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/app/actividades' }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ACT: Activity = {
  id: 'A1', title: 'Concierto de prueba', category: 'Concierto', date: '10 jun 2026',
  startsAt: '2026-06-10T19:00:00.000Z', location: 'Sala 2', status: 'done', statusLabel: 'Finalizada',
  registered: 80, capacity: 100, occupancyPct: 80, type: 'concierto', statusRaw: 'finalizada',
};

const DETAIL = {
  id: 'A1', name: 'Concierto de prueba', type: 'concierto', location: 'Sala 2',
  date: '2026-06-10T19:00:00.000Z', endDate: null, capacity: 100, enrolledCount: 80,
  status: 'finalizada', description: 'Una descripción', category: 'Concierto', imageUrl: null, imagePosY: null, audience: 'adultos',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const SUMMARY = {
  totalAttendances: 5, identifiedCount: 4, anonymousCount: 1, occupancyPct: 80,
  newcomers: 2, returning: 2, vipCount: 1, avgPriorAttendances: 2.8, newcomerRatio: 50,
  companionsChildren: 3, companionsAdults: 2, peopleInRoom: 10,
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
    expect(screen.getByText('80% en sala · 1 sin credencial')).toBeInTheDocument();
    expect(screen.getByText('Nuevos visitantes')).toBeInTheDocument();
    expect(screen.getByText('50% de 4 identificados')).toBeInTheDocument();
    expect(screen.getByText('Habituales')).toBeInTheDocument();
    expect(screen.getByText('Prom. 2.8 visitas previas')).toBeInTheDocument();
    expect(screen.getByText('VIPs presentes')).toBeInTheDocument();
    expect(screen.getByText('Personas en sala')).toBeInTheDocument();
    expect(screen.getByText('Incluye 3 niños y 2 adultos acompañantes')).toBeInTheDocument();
    expect(screen.getByText('Sin credencial')).toBeInTheDocument();
  });

  it('actividad ACTIVA → el encabezado dice "Resumen en vivo"', async () => {
    mockFetch({ status: 200, body: { summary: { ...SUMMARY, companionsChildren: 0, companionsAdults: 0, peopleInRoom: 5, anonymousCount: 0 } } });
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

  // ── Reservas vs asistencias (fix 2026-10) ──
  it('solo reservas (0 check-ins): mosaico "Reservados (en lista)" + sin Nuevos/Habituales/VIP', async () => {
    mockFetch({ status: 200, body: { summary: { ...SUMMARY, totalAttendances: 0, identifiedCount: 0, anonymousCount: 0, newcomers: 0, returning: 0, vipCount: 0, companionsChildren: 0, companionsAdults: 0, peopleInRoom: 0, newcomerRatio: 0, avgPriorAttendances: 0, reservedCount: 42, reservedPeople: 55, roomPct: 0 } } });
    render(<ActivityDetailDrawer activity={ACT} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Reservados (en lista)')).toBeInTheDocument());
    expect(screen.getByText('55 personas con cupo retenido')).toBeInTheDocument();
    expect(screen.getByText('0% en sala')).toBeInTheDocument();
    expect(screen.queryByText('Nuevos visitantes')).toBeNull();
    expect(screen.queryByText('Habituales')).toBeNull();
    expect(screen.queryByText(/VIPs presentes/)).toBeNull();
  });

  it('con check-ins y reservas: Asistencias usa roomPct y aparecen ambos mosaicos', async () => {
    mockFetch({ status: 200, body: { summary: { ...SUMMARY, roomPct: 10, reservedCount: 2, reservedPeople: 3 } } });
    render(<ActivityDetailDrawer activity={ACT} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Reservados (en lista)')).toBeInTheDocument());
    expect(screen.getByText('10% en sala · 1 sin credencial')).toBeInTheDocument();
    expect(screen.getByText('3 personas con cupo retenido')).toBeInTheDocument();
    expect(screen.getByText('Nuevos visitantes')).toBeInTheDocument();
  });

  it('fila de aforo se llama "Aforo comprometido" con tooltip "incluye reservas"', async () => {
    mockFetch({ status: 200, body: { summary: SUMMARY } });
    render(<ActivityDetailDrawer activity={ACT} onClose={vi.fn()} />);
    const label = await screen.findByText('Aforo comprometido');
    expect(label.getAttribute('title')).toMatch(/incluye reservas/i);
    expect(screen.queryByText('Ocupación')).toBeNull();
  });

  it('API vieja (sin reservedCount/roomPct): igual que antes, sin mosaico de reservados', async () => {
    mockFetch({ status: 200, body: { summary: SUMMARY } });
    render(<ActivityDetailDrawer activity={ACT} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Resumen post-evento')).toBeInTheDocument());
    expect(screen.getByText('80% en sala · 1 sin credencial')).toBeInTheDocument();
    expect(screen.queryByText('Reservados (en lista)')).toBeNull();
  });
});

describe('ActivityDetailDrawer · a11y (Q8-22/27)', () => {
  it('cada <dt>/<dd> cuelga de un <dl> (directo o vía <div> de grupo) y el foco queda en el diálogo', async () => {
    mockFetch({ status: 200, body: { summary: SUMMARY } });
    render(<ActivityDetailDrawer activity={ACT} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Resumen post-evento')).toBeInTheDocument());
    const terms = document.querySelectorAll('dt, dd');
    expect(terms.length).toBeGreaterThan(0);
    terms.forEach((el) => {
      const p = el.parentElement!;
      const ok = p.tagName === 'DL' || (p.tagName === 'DIV' && p.parentElement?.tagName === 'DL');
      expect(ok).toBe(true);
    });
    // Un grupo <div> sólo contiene dt/dd (sin íconos ni spans sueltos).
    document.querySelectorAll('dl > div').forEach((g) => {
      Array.from(g.children).forEach((c) => expect(['DT', 'DD']).toContain(c.tagName));
    });
    // Trampa de foco: Tab desde el último control vuelve dentro del diálogo.
    const dialog = screen.getByRole('dialog');
    const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), a[href], input, select, textarea, [tabindex="0"]'));
    items[items.length - 1]!.focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(items[0]);
  });
});
