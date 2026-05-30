import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { NAV_ITEMS } from '../../lib/shell/nav';
import { DEFAULT_BRANDING } from '../../lib/branding/config';

// vitest corre con globals:false → el afterEach(cleanup) automático de Testing
// Library no se registra solo. Sin esto, los renders se acumulan entre tests y
// getByRole encuentra duplicados.
afterEach(cleanup);

describe('Sidebar', () => {
  it('renderiza todos los nav items, incluido "Mi equipo" (no "Staff")', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="dashboard" />);
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
  });

  it('marca el item activo (según activeKey) con aria-current="page"', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="actividades" />);
    expect(screen.getByRole('link', { name: 'Actividades' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('usa hrefs reales para Dashboard y Actividades', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="dashboard" />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: 'Actividades' })).toHaveAttribute('href', '/app/actividades');
  });

  it('muestra el nombre de la organización como brand-mark cuando no hay logo', () => {
    render(<Sidebar branding={{ ...DEFAULT_BRANDING, logoUrl: null }} activeKey="dashboard" />);
    expect(screen.getByText(DEFAULT_BRANDING.name)).toBeInTheDocument();
  });
});
