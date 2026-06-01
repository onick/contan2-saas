import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EquipoPage from './page';

afterEach(cleanup);

describe('/app/equipo', () => {
  it('renderiza el encabezado, miembros y roles', () => {
    render(<EquipoPage />);
    expect(screen.getByRole('heading', { name: 'Mi equipo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Miembros' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Roles y permisos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invitar miembro/ })).toBeInTheDocument();
  });

  it('muestra un miembro con invitación pendiente y roles RBAC', () => {
    render(<EquipoPage />);
    expect(screen.getByText('Invitación pendiente')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Propietario' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recepción' })).toBeInTheDocument();
  });

  it('marca "Mi equipo" como ítem activo del sidebar', () => {
    render(<EquipoPage />);
    expect(screen.getByRole('link', { name: 'Mi equipo' })).toHaveAttribute('aria-current', 'page');
  });
});
