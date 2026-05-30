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

  it('renderiza el destacado Los Congos con su ocupación', () => {
    render(<TenantAdminDashboard />);
    expect(screen.getAllByText('Los Congos de Villa Mella').length).toBeGreaterThan(0);
    expect(screen.getByText('219')).toBeInTheDocument();
    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.getAllByText('88%').length).toBeGreaterThan(0);
  });

  it('lista actividades recientes con estado y conteo gestionado', () => {
    render(<TenantAdminDashboard />);
    expect(screen.getByText('5to Ciclo de Cine Dominicano | CuCú')).toBeInTheDocument();
    expect(screen.getByText('Cine Clásico | Perdición')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
    // "en gestión" aparece en el insight y en el encabezado de la tabla.
    expect(screen.getAllByText(/en gestión/i).length).toBeGreaterThan(0);
  });
});
