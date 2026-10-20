import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ActivityFeed } from './ActivityFeed';

afterEach(cleanup);

describe('ActivityFeed · variante rows', () => {
  const items = [
    { id: '1', action: 'biblio.item.retired', detalle: 'E2E-001', at: '2026-10-16T10:00:00Z' },
    { id: '2', action: 'biblio.exported', at: '2026-10-16T09:00:00Z' },
  ];

  it('título en una línea, detalle debajo y hora a la derecha', () => {
    const { container } = render(<ActivityFeed variant="rows" items={items} />);
    const title = screen.getByText('Libro dado de baja');
    const detail = screen.getByText('E2E-001');
    expect(title.tagName).toBe('P');
    expect(detail.tagName).toBe('P');
    expect(title).not.toBe(detail);
    expect(title.className).toContain('font-semibold');
    const [li, li2] = Array.from(container.querySelectorAll('li'));
    expect(li!.lastElementChild!.tagName).toBe('TIME');
    expect(li!.querySelector('span[aria-hidden="true"]')!.className).toContain('bg-danger-bg');
    // sin detalle no se renderiza la segunda línea
    expect(li2!.querySelectorAll('p')).toHaveLength(1);
  });

  it('la variante por defecto sigue juntando frase y detalle con "·"', () => {
    render(<ActivityFeed items={items} />);
    expect(screen.getByText('E2E-001').closest('p')).toBe(screen.getByText('Libro dado de baja').closest('p'));
  });
});

describe('ActivityFeed · target y overflow (Q8-28/46)', () => {
  it('"Ver todo" tiene alto mínimo de 24 px (min-h-6)', () => {
    render(<ActivityFeed items={[]} verTodoHref="/app/historial" />);
    expect(screen.getByRole('link', { name: 'Ver todo' }).className).toContain('min-h-6');
  });

  it('el texto largo (detalle sin espacios) puede quebrar y los contenedores pueden encoger', () => {
    const long = 'x'.repeat(200) + '@ejemplo.org';
    const { container } = render(
      <ActivityFeed items={[{ id: '1', action: 'login', detalle: long, at: new Date().toISOString() }]} />,
    );
    const p = screen.getByText(long).closest('p')!;
    expect(p.className).toContain('overflow-wrap:anywhere');
    expect(container.firstElementChild!.className).toContain('min-w-0');
    expect(container.querySelector('li')!.className).toContain('min-w-0');
  });
});
