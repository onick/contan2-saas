import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TenantAdminDashboard from './page';

// globals:false → cleanup explícito (este test renderiza el shell completo).
afterEach(cleanup);

describe('/app · dashboard tenant-admin', () => {
  it('renderiza las métricas clave del período', () => {
    render(<TenantAdminDashboard />);
    expect(screen.getByText('510')).toBeInTheDocument();
    expect(screen.getByText('1,137')).toBeInTheDocument();
    expect(screen.getByText('57%')).toBeInTheDocument();
    expect(screen.getByText('23%')).toBeInTheDocument();
  });

  it('renderiza el caso destacado (Los Congos) con su ocupación', () => {
    render(<TenantAdminDashboard />);
    // El título aparece en el highlight y en la lista → getAllByText.
    expect(screen.getAllByText('Los Congos de Villa Mella').length).toBeGreaterThan(0);
    expect(screen.getByText('219')).toBeInTheDocument();
    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.getByText('88% de ocupación')).toBeInTheDocument();
  });

  it('lista las actividades recientes y el conteo administrado', () => {
    render(<TenantAdminDashboard />);
    expect(screen.getByText('5to Ciclo de Cine Dominicano | CuCú')).toBeInTheDocument();
    expect(screen.getByText('Cine Clásico | Perdición')).toBeInTheDocument();
    expect(screen.getByText(/actividades administradas/i)).toBeInTheDocument();
  });
});
