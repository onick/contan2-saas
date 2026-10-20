import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogClient } from './CatalogClient';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/app/biblioteca/catalogo' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));

afterEach(cleanup);

const LONG_TITLE = 'Historia completa del arte precolombino en América Latina y sus influencias en la cultura contemporánea dominicana';

const mockTitle = {
  id: 't1',
  title: LONG_TITLE,
  authors: ['Autor Ejemplo'],
  isbn: null,
  kind: 'libro' as const,
  coverUrl: null,
  itemsTotal: 1,
  itemsActive: 1,
  itemsLoaned: 0,
  year: 2020,
  genre: null,
};

const initial = { titles: [mockTitle], total: 1, page: 1, pageSize: 20 } as unknown as Parameters<typeof CatalogClient>[0]['initial'];

describe('CatalogClient · título en tarjeta móvil', () => {
  it('no aplica truncate al título largo en la tarjeta móvil (table view)', () => {
    render(<CatalogClient initial={initial} sites={[]} facets={null} />);
    // mobileCard renders a <p> with the title; desktop renders it inside a <span>
    const mobileTitleEl = screen.getAllByText(LONG_TITLE).find((el) => el.tagName === 'P');
    expect(mobileTitleEl).toBeTruthy();
    expect(mobileTitleEl!.className).not.toContain('truncate');
  });

  it('sin line-clamp (título completo) y con break-words en la tarjeta móvil', () => {
    render(<CatalogClient initial={initial} sites={[]} facets={null} />);
    const mobileTitleEl = screen.getAllByText(LONG_TITLE).find((el) => el.tagName === 'P');
    expect(mobileTitleEl!.className).not.toMatch(/line-clamp/);
    expect(mobileTitleEl!.className).toContain('break-words');
  });

  it('no aplica truncate al título bajo la portada en vista de tarjetas (TitleCoverCard)', () => {
    render(<CatalogClient initial={initial} sites={[]} facets={null} />);
    // Switch to grid view — TitleCoverCard only renders when view === 'tarjetas'
    fireEvent.click(screen.getByRole('button', { name: /Tarjetas/ }));
    const allTitleEls = screen.getAllByText(LONG_TITLE);
    const coverCardTitle = allTitleEls.find((el) => el.tagName === 'SPAN' && el.className.includes('mt-1.5'));
    expect(coverCardTitle).toBeTruthy();
    expect(coverCardTitle!.className).not.toContain('truncate');
    expect(coverCardTitle!.className).not.toMatch(/line-clamp/);
    expect(coverCardTitle!.className).toContain('break-words');
  });
});

describe('CatalogClient · botón Importar', () => {
  it('está deshabilitado y rotulado "Pronto" (igual que Lectores) hasta que exista la importación', () => {
    render(<CatalogClient initial={initial} sites={[]} facets={null} />);
    const imp = screen.getByRole('button', { name: /Importar/ });
    expect(imp).toBeDisabled();
    expect(imp).toHaveTextContent(/Pronto/);
  });
});

describe('CatalogClient · CTA Agregar libro (SplitButton)', () => {
  it('la acción principal enlaza al alta y el menú ofrece ISBN y Manual con ?modo', async () => {
    const user = userEvent.setup();
    render(<CatalogClient initial={initial} sites={[]} facets={null} />);
    const main = screen.getByRole('link', { name: 'Agregar libro' });
    expect(main).toHaveAttribute('href', '/app/biblioteca/titulos/nuevo');
    await user.click(screen.getByRole('button', { name: 'Más formas de agregar un libro' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Por ISBN (autocompletar)', 'Manual']);
    expect(items[0]).toHaveAttribute('href', '/app/biblioteca/titulos/nuevo?modo=isbn');
    expect(items[1]).toHaveAttribute('href', '/app/biblioteca/titulos/nuevo?modo=manual');
  });
});
