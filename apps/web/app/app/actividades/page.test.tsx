import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ActividadesPage from './page';

// globals:false → cleanup explícito (renderiza el shell completo).
afterEach(cleanup);

describe('/app/actividades', () => {
  it('renderiza el encabezado y la acción primaria', () => {
    render(<ActividadesPage />);
    expect(screen.getByRole('heading', { name: 'Actividades' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nueva actividad/i })).toBeInTheDocument();
  });

  it('renderiza tabs de estado y filas de actividades', () => {
    render(<ActividadesPage />);
    expect(screen.getByText(/Finalizadas/)).toBeInTheDocument();
    expect(screen.getByText('Visita Guiada CITLALLY MIRANDA')).toBeInTheDocument();
    expect(screen.getByText('Los Congos de Villa Mella')).toBeInTheDocument();
  });

  it('marca "Actividades" como ítem activo del sidebar', () => {
    render(<ActividadesPage />);
    expect(screen.getByRole('link', { name: 'Actividades' })).toHaveAttribute('aria-current', 'page');
  });
});
