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

vi.mock('next/navigation', () => ({ usePathname: () => '/app/biblioteca' }));
vi.mock('../../../lib/api/biblio-client', () => ({ devolverLoan: vi.fn() }));

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
  it('con datos: 4 KPI con leyenda, pestañas y estados vacíos', async () => {
    facets.mockResolvedValue({ ok: true, data: { total: 7, items: { total: 2, active: 2 } } });
    render(await BibliotecaInicioPage());
    expect(screen.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Secciones de Biblioteca' })).toBeInTheDocument();
    const pairs: [string, string][] = [['Títulos', 'En el catálogo'], ['Ejemplares', 'Colección física'], ['En buen estado', 'Ejemplares'], ['Sitios físicos', 'Ubicaciones']];
    for (const [label, hint] of pairs) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      expect(screen.getAllByText(hint).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Préstamos por vencer')).toBeInTheDocument();
    expect(screen.getByText('Sin actividad reciente.')).toBeInTheDocument();
  });
  it('error de red muestra "no disponible" con reintento', async () => {
    facets.mockResolvedValue({ ok: false, reason: 'unavailable' });
    render(await BibliotecaInicioPage());
    expect(screen.getByText('Biblioteca no disponible')).toBeInTheDocument();
    expect(screen.getByText(/Inténtalo de nuevo/)).toBeInTheDocument();
    expect(screen.getByText('Reintentar')).toBeInTheDocument();
  });
});
