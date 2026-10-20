import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/app/biblioteca/inventario' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => <a href={href} {...p}>{children}</a>,
}));

import { BibliotecaHeader } from './BibliotecaHeader';

afterEach(cleanup);

describe('BibliotecaHeader', () => {
  it('as="h1": el título del módulo es el h1 y muestra las acciones', () => {
    render(<BibliotecaHeader as="h1" actions={<button type="button">Acción</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.getByText('Catálogo, préstamos y lectores')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument();
  });

  it('as="p": no aporta ningún heading (el h1 lo pone la página)', () => {
    render(<BibliotecaHeader as="p" />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Biblioteca')).toBeInTheDocument();
  });

  it('incluye la bandeja de pestañas con la activa marcada', () => {
    render(<BibliotecaHeader as="p" />);
    expect(screen.getByRole('navigation', { name: 'Secciones de Biblioteca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inventario' })).toHaveAttribute('aria-current', 'page');
  });
});
