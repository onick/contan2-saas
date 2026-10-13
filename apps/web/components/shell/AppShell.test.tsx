import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppShell } from './AppShell';
import { DEFAULT_BRANDING } from '../../lib/branding/config';

// globals:false → cleanup explícito entre renders (ver Sidebar.test.tsx).
afterEach(cleanup);

describe('AppShell', () => {
  it('renderiza sidebar (nav principal), topbar (breadcrumb) y el contenido en <main>', async () => {
    const ui = await AppShell({ branding: DEFAULT_BRANDING, title: 'Inicio', role: null, children: <p>contenido hijo</p> });
    render(ui);

    // Navegación del sidebar (única con nombre "Navegación principal" — la barra
    // inferior ahora tiene aria-label="Navegación inferior").
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    // Topbar: el breadcrumb (nav "Ruta") está presente.
    expect(screen.getByRole('navigation', { name: 'Ruta' })).toBeInTheDocument();
    // El título aparece en el breadcrumb.
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0);
    // Main: el contenido hijo se renderiza dentro de <main>.
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent('contenido hijo');
    // Shell de colapso presente (expandido por defecto sin cookie) + toggle accesible.
    expect(document.querySelector('[data-sidebar="expanded"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Colapsar navegación' })).toBeInTheDocument();
  });
});
