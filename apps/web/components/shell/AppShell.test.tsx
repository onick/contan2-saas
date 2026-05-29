import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppShell } from './AppShell';
import { DEFAULT_BRANDING } from '../../lib/branding/config';

// globals:false → cleanup explícito entre renders (ver Sidebar.test.tsx).
afterEach(cleanup);

describe('AppShell', () => {
  it('renderiza sidebar (nav principal), topbar con título y el contenido en <main>', () => {
    render(
      <AppShell branding={DEFAULT_BRANDING} title="Dashboard">
        <p>contenido hijo</p>
      </AppShell>,
    );

    // Sidebar: la nav principal está presente.
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    // Topbar: el título de sección (desktop) está en el DOM.
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    // Main: el contenido hijo se renderiza dentro de <main>.
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent('contenido hijo');
  });
});
