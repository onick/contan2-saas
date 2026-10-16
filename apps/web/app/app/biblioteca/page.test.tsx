import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const facets = vi.fn();
vi.mock('../../../lib/api/biblio', () => ({
  getBiblioFacetsResult: () => facets(),
  getBiblioSites: async () => null,
  getBiblioOverview: async () => null,
  getBiblioLoans: async () => null,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}));

import BibliotecaInicioPage from './page';

afterEach(cleanup);

describe('/app/biblioteca · BIB-09a', () => {
  it('403 muestra "sin permiso" y no invita a reintentar', async () => {
    facets.mockResolvedValue({ ok: false, reason: 'forbidden' });
    render(await BibliotecaInicioPage());
    expect(screen.getByText('No tienes permiso para ver Biblioteca')).toBeInTheDocument();
    expect(screen.queryByText(/Biblioteca no disponible/)).toBeNull();
    expect(screen.queryByText('Reintentar')).toBeNull();
  });
  it('error de red muestra "no disponible" con reintento', async () => {
    facets.mockResolvedValue({ ok: false, reason: 'unavailable' });
    render(await BibliotecaInicioPage());
    expect(screen.getByText('Biblioteca no disponible')).toBeInTheDocument();
    expect(screen.getByText(/Inténtalo de nuevo/)).toBeInTheDocument();
    expect(screen.getByText('Reintentar')).toBeInTheDocument();
  });
});
