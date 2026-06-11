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
  { id: 't1', userCode: 'CCB-AAA111', firstName: 'Ana', lastName: 'Pérez', activityId: 'A1', activityName: 'X', anonymous: false, checkedInAt: null, registeredAt: '2026-06-11T15:00:00.000Z' },
  { id: 't2', userCode: null, firstName: null, lastName: null, activityId: 'A1', activityName: 'X', anonymous: true, checkedInAt: null, registeredAt: '2026-06-11T15:05:00.000Z' },
];

function mockFetch(items = ITEMS) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ items, total: items.length, limit: 200, offset: 0 }),
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
});
