import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let pathname = '/app/biblioteca';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}));

import { BibliotecaTabsNav } from './BibliotecaTabsNav';

afterEach(cleanup);

describe('BibliotecaTabsNav · bandeja con iconos', () => {
  it('renderiza las 6 pestañas con sus textos, icono decorativo y nombre accesible', () => {
    render(<BibliotecaTabsNav />);
    const nav = screen.getByRole('navigation', { name: 'Secciones de Biblioteca' });
    for (const t of ['Inicio', 'Catálogo', 'Lectores', 'Préstamos', 'Reservas', 'Inventario']) {
      const link = screen.getByRole('link', { name: t });
      expect(nav).toContainElement(link);
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('marca aria-current solo en la pestaña activa (Inicio)', () => {
    render(<BibliotecaTabsNav />);
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Catálogo' })).not.toHaveAttribute('aria-current');
  });

  it('la ficha de un título mantiene activo Catálogo y circulación activa Préstamos', () => {
    pathname = '/app/biblioteca/titulos/abc';
    const { unmount } = render(<BibliotecaTabsNav />);
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('aria-current', 'page');
    unmount();
    pathname = '/app/biblioteca/circulacion';
    render(<BibliotecaTabsNav />);
    expect(screen.getByRole('link', { name: 'Préstamos' })).toHaveAttribute('aria-current', 'page');
    pathname = '/app/biblioteca';
  });
});
