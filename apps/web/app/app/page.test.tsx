import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TenantAdminDashboard from './page';

// globals:false → cleanup explícito (este test renderiza el shell completo).
afterEach(cleanup);

describe('/app · dashboard tenant-admin', () => {
  it('renderiza las métricas clave', () => {
    render(<TenantAdminDashboard />);
    expect(screen.getByText('510')).toBeInTheDocument();
    expect(screen.getByText('1,181')).toBeInTheDocument();
    expect(screen.getByText('57')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
  });

  it('renderiza la actividad próxima y el destacado', () => {
    render(<TenantAdminDashboard />);
    expect(screen.getByText('Visita Guiada CITLALLY MIRANDA')).toBeInTheDocument();
    expect(screen.getAllByText('Los Congos de Villa Mella').length).toBeGreaterThan(0);
    expect(screen.getByText('219')).toBeInTheDocument();
    expect(screen.getAllByText('88%').length).toBeGreaterThan(0);
  });

  it('renderiza top actividades y últimos visitantes', () => {
    render(<TenantAdminDashboard />);
    expect(screen.getByText('5to Ciclo de Cine Dominicano | Kacimiro')).toBeInTheDocument();
    expect(screen.getByText('Cine Clásico | Perdición')).toBeInTheDocument();
    expect(screen.getByText('Top actividades')).toBeInTheDocument();
    expect(screen.getByText('Últimos visitantes')).toBeInTheDocument();
    expect(screen.getByText('Sofía Méndez')).toBeInTheDocument();
  });
});
