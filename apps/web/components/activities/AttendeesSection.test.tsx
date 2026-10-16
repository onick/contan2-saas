import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { AttendeesSection } from './AttendeesSection';
import { ProfileProvider } from '../usuarios/ProfileProvider';

// Asistentes de la actividad: lista real, anónimos señalados, fila → abre
// perfil (ProfileProvider), export sólo con permiso.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/actividades',
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ITEMS = [
  { id: 't1', userCode: 'CCB-AAA111', firstName: 'Ana', lastName: 'Pérez', activityId: 'A1', activityName: 'X', anonymous: false, checkedInAt: '2026-06-11T15:00:00.000Z', registeredAt: '2026-06-11T15:00:00.000Z', companionsChildren: 0, companionsAdults: 0 },
  { id: 't2', userCode: null, firstName: null, lastName: null, activityId: 'A1', activityName: 'X', anonymous: true, checkedInAt: '2026-06-11T15:05:00.000Z', registeredAt: '2026-06-11T15:05:00.000Z', companionsChildren: 0, companionsAdults: 0 },
];

function mockFetch(items: Array<Record<string, unknown>> = ITEMS, extra: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ items, total: items.length, limit: 200, offset: 0, ...extra }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )));
}

describe('AttendeesSection', () => {
  it('lista asistentes con conteo; el anónimo se señala; export visible con permiso', async () => {
    mockFetch();
    render(<ProfileProvider canEdit><AttendeesSection activityId="A1" canExport /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument());
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByText(/Sin credencial \(walk-in\)/)).toBeInTheDocument();
    const exp = screen.getByRole('link', { name: /Exportar Excel/ });
    expect(exp.getAttribute('href')).toBe('/app/reportes/api/activity/A1.xlsx');
  });

  it('sin permiso no hay export; fila identificada abre el perfil', async () => {
    mockFetch();
    render(<ProfileProvider canEdit={false}><AttendeesSection activityId="A1" canExport={false} /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /Exportar Excel/ })).toBeNull();
    // click abre el drawer de perfil (carga el perfil → spinner/contenido)
    fireEvent.click(screen.getByRole('button', { name: /Abrir perfil de Ana/ }));
    await waitFor(() => expect(document.querySelector('[role=dialog]')).toBeTruthy());
  });

  it('vacío honesto', async () => {
    mockFetch([]);
    render(<ProfileProvider><AttendeesSection activityId="A1" canExport={false} /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText(/Aún no hay asistentes/)).toBeInTheDocument());
  });

  // ── Reservas vs asistencias (fix 2026-10) ──
  const HOLD = { id: 't3', userCode: 'CCB-BBB222', firstName: 'Luis', lastName: 'Gómez', activityId: 'A1', activityName: 'X', anonymous: false, checkedInAt: null, registeredAt: '2026-06-09T10:00:00.000Z', companionsChildren: 0, companionsAdults: 2 };
  const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  it('reserva: cuenta aparte, badge "Reservado (en lista)", sin borrar/editar y con nota', async () => {
    mockFetch([ITEMS[0]!, HOLD], { checkedIn: 1, reserved: 1, checkedInPeople: 1, reservedPeople: 3 });
    render(<ProfileProvider canEdit><AttendeesSection activityId="A1" canExport activityStatus="activa" /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText('Luis Gómez')).toBeInTheDocument());
    expect(screen.getByText('(1)')).toBeInTheDocument();
    expect(screen.getByText(/1 reservado\b/)).toBeInTheDocument();
    expect(screen.getByText(`Asistió ${hhmm('2026-06-11T15:00:00.000Z')}`)).toBeInTheDocument();
    expect(screen.getByText('Reservado (en lista)')).toBeInTheDocument();
    // solo la fila check-in tiene lápiz/papelera
    expect(screen.getAllByRole('button', { name: 'Quitar esta asistencia' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Editar acompañantes' })).toHaveLength(1);
    expect(screen.getByText(/Se gestiona desde Invitaciones\/Protocolo/)).toBeInTheDocument();
  });

  it('orden: check-ins primero aunque la reserva venga antes', async () => {
    mockFetch([HOLD, ITEMS[0]!], { checkedIn: 1, reserved: 1 });
    render(<ProfileProvider><AttendeesSection activityId="A1" canExport={false} /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument());
    const names = screen.getAllByText(/Ana Pérez|Luis Gómez/).map((n) => n.textContent);
    expect(names).toEqual(['Ana Pérez', 'Luis Gómez']);
  });

  it('chips Todos/Asistieron/Reservados filtran la lista', async () => {
    mockFetch([ITEMS[0]!, HOLD], { checkedIn: 1, reserved: 1 });
    render(<ProfileProvider><AttendeesSection activityId="A1" canExport={false} /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Reservados/ }));
    expect(screen.queryByText('Ana Pérez')).toBeNull();
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Asistieron/ }));
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Luis Gómez')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
  });

  it('actividad finalizada: la reserva dice "No asistió"', async () => {
    mockFetch([ITEMS[0]!, HOLD], { checkedIn: 1, reserved: 1 });
    render(<ProfileProvider><AttendeesSection activityId="A1" canExport={false} activityStatus="finalizada" /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText('Luis Gómez')).toBeInTheDocument());
    expect(screen.getByText('No asistió')).toBeInTheDocument();
    expect(screen.queryByText('Reservado (en lista)')).toBeNull();
  });

  it('solo reservas: "Aún no llegó nadie · N en lista" y la lista de reservas sigue visible', async () => {
    mockFetch([HOLD], { checkedIn: 0, reserved: 1 });
    render(<ProfileProvider><AttendeesSection activityId="A1" canExport={false} /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText(/Aún no llegó nadie · 1 en lista/)).toBeInTheDocument());
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
  });

  it('API vieja (sin checkedIn/reserved): conteos derivados de los items', async () => {
    mockFetch([ITEMS[0]!, HOLD]); // sin campos nuevos en el body
    render(<ProfileProvider><AttendeesSection activityId="A1" canExport={false} /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText('Luis Gómez')).toBeInTheDocument());
    expect(screen.getByText('(1)')).toBeInTheDocument();
    expect(screen.getByText(/1 reservado\b/)).toBeInTheDocument();
    expect(screen.getByText('Reservado (en lista)')).toBeInTheDocument();
  });

  it('sin reservas no hay chips ni nota', async () => {
    mockFetch();
    render(<ProfileProvider><AttendeesSection activityId="A1" canExport={false} /></ProfileProvider>);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Reservados/ })).toBeNull();
    expect(screen.queryByText(/Se gestiona desde/)).toBeNull();
  });
});
