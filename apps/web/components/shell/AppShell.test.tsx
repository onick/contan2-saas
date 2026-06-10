import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppShell } from './AppShell';
import { DEFAULT_BRANDING } from '../../lib/branding/config';

// globals:false → cleanup explícito entre renders (ver Sidebar.test.tsx).
afterEach(cleanup);

describe('AppShell', () => {
  it('renderiza sidebar (nav principal), topbar (breadcrumb) y el contenido en <main>', () => {
    render(
      <AppShell branding={DEFAULT_BRANDING} title="Dashboard">
        <p>contenido hijo</p>
      </AppShell>,
    );

    // Sidebar: la nav principal está presente.
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    // Topbar: el breadcrumb (nav "Ruta") está presente.
    expect(screen.getByRole('navigation', { name: 'Ruta' })).toBeInTheDocument();
    // El título aparece (en el sidebar como link activo y en el breadcrumb).
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    // Main: el contenido hijo se renderiza dentro de <main>.
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent('contenido hijo');
    // Shell de colapso presente (expandido por defecto sin cookie) + toggle accesible.
    expect(document.querySelector('[data-sidebar="expanded"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Colapsar navegación' })).toBeInTheDocument();
  });
});
