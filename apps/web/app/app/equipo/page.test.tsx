import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EquipoPage from './page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const emptyTeam = () => new Response('{"items":[],"nextCursor":null}', { status: 200, headers: { 'content-type': 'application/json' } });

describe('/app/equipo', () => {
  it('renderiza el encabezado y la lista real (filtros server-side, sin demo)', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyTeam()));
    render(<EquipoPage />);
    expect(screen.getByRole('heading', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por rol')).toBeInTheDocument(); // tabla real, no demo
  });

  it('marca "Mi equipo" como ítem activo del sidebar', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyTeam()));
    render(<EquipoPage />);
    expect(screen.getByRole('link', { name: 'Mi equipo' })).toHaveAttribute('aria-current', 'page');
  });
});
