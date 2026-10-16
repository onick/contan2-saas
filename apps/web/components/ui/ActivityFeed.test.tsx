import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ActivityFeed } from './ActivityFeed';

afterEach(cleanup);

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
