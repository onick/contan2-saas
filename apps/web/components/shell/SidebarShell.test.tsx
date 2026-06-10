import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SidebarShell, SidebarToggle, SIDEBAR_COOKIE } from './SidebarShell';

afterEach(() => {
  cleanup();
  document.cookie = `${SIDEBAR_COOKIE}=; path=/; max-age=0`;
});

function setup(cookieCollapsed = false) {
  if (cookieCollapsed) document.cookie = `${SIDEBAR_COOKIE}=1; path=/`;
  render(
    <SidebarShell>
      <aside id="app-sidebar"><SidebarToggle /></aside>
      <main>contenido</main>
    </SidebarShell>,
  );
}

const shellState = () => document.querySelector('[data-sidebar]')?.getAttribute('data-sidebar');

describe('SidebarShell', () => {
  it('sin flash: la cookie pinta el estado desde el primer render (initializer)', () => {
    setup(true);
    expect(shellState()).toBe('collapsed');
    expect(screen.getByRole('button', { name: 'Expandir navegación' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggle alterna el data-attribute, el aria-expanded y persiste en cookie', () => {
    setup(false);
    const btn = screen.getByRole('button', { name: 'Colapsar navegación' });
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn).toHaveAttribute('aria-controls', 'app-sidebar');
    fireEvent.click(btn);
    expect(shellState()).toBe('collapsed');
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE}=1`);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir navegación' }));
    expect(shellState()).toBe('expanded');
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE}=0`);
  });

  it('atajo ⌘B/Ctrl+B togglea, pero NO dentro de un input', () => {
    setup(false);
    fireEvent.keyDown(document, { key: 'b', metaKey: true });
    expect(shellState()).toBe('collapsed');
    // dentro de un input no roba el atajo
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'b', ctrlKey: true });
    expect(shellState()).toBe('collapsed'); // sin cambios
    input.remove();
  });
});
