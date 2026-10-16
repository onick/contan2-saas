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
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="dashboard" role="owner" />);
    for (const item of NAV_ITEMS) {
      // Sin aria-label: el nombre es el texto visible (label + badge estático si lo hay).
      const link = screen.getByRole('link', { name: new RegExp(`^${item.label}`) });
      expect(link).toBeInTheDocument();
      expect(link).not.toHaveAttribute('aria-label');
    }
    expect(screen.getByRole('link', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
  });

  it('marca el item activo (según activeKey) con aria-current="page"', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="actividades" role="owner" />);
    expect(screen.getByRole('link', { name: 'Actividades' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });

  it('usa hrefs reales para Inicio y Actividades', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="dashboard" role="owner" />);
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: 'Actividades' })).toHaveAttribute('href', '/app/actividades');
  });

  it('sin logo → iniciales', () => {
    render(<Sidebar branding={{ ...DEFAULT_BRANDING, logoUrl: null }} activeKey="dashboard" role="owner" />);
    const chip = screen.getByTestId('brand-chip');
    expect(chip).toBeInTheDocument();
    // Sin SVG propio: siempre iniciales del nombre (CC para "Centro Cultural Banreservas").
    expect(chip.querySelector('svg')).toBeFalsy();
    expect(chip.textContent).toBe('CC');
  });

  it('tenant sin icono registrado: el chip cae a iniciales', () => {
    render(<Sidebar branding={{ ...DEFAULT_BRANDING, slug: 'otro-tenant', name: 'Museo de Arte Moderno' }} activeKey="dashboard" role="owner" />);
    const chips = screen.getAllByTestId('brand-chip');
    expect(chips[0]?.textContent).toBe('MD');
    // Dos líneas de nombre en el sidebar expandido.
    expect(screen.getByText('Museo de Arte')).toBeInTheDocument();
    // nameSub se renderiza como "${nameSub} · Admin".
    expect(screen.getByText('Moderno · Admin')).toBeInTheDocument();
  });

  it('role=protocolo → solo ítems del allowlist (protocolo + cuenta)', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="protocolo" role="protocolo" />);
    expect(screen.getByRole('link', { name: 'Protocolo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Actividades' })).not.toBeInTheDocument();
  });

  it('role=puerta → registros visible, inicio oculto', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="puerta" role="puerta" />);
    expect(screen.getByRole('link', { name: 'Registros' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
  });

  it('role=biblioteca → mi cuenta visible, inicio oculto', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="biblioteca" role="biblioteca" />);
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
  });

  it('role=null → fail-closed: solo Mi cuenta, no se lista todo', () => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="dashboard" role={null} />);
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mi equipo' })).not.toBeInTheDocument();
  });

  it.each(['operator', 'consulta'])('role=%s → con Reportes (solo lectura), sin Mi equipo, Historial, Identidad ni Biblioteca', (role) => {
    render(<Sidebar branding={DEFAULT_BRANDING} activeKey="dashboard" role={role} />);
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reportes/ })).toBeInTheDocument();
    for (const n of ['Mi equipo', 'Historial', 'Identidad', 'Biblioteca', 'Protocolo']) {
      expect(screen.queryByRole('link', { name: n })).not.toBeInTheDocument();
    }
  });
});
