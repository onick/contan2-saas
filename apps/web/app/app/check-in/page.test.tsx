import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CheckinPage from './page';

// globals:false → cleanup explícito (renderiza el shell completo).
afterEach(cleanup);

describe('/app/check-in', () => {
  it('renderiza el encabezado y las acciones de la estación', () => {
    render(<CheckinPage />);
    expect(screen.getByRole('heading', { name: 'Check-in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /escanear/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo visitante/i })).toBeInTheDocument();
  });

  it('renderiza actividades activas y el feed en vivo', () => {
    render(<CheckinPage />);
    expect(screen.getByRole('heading', { name: 'Actividades activas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Movimiento' })).toBeInTheDocument();
    // Una entrada del feed (dato demo).
    expect(screen.getByText('Sofía Méndez')).toBeInTheDocument();
    expect(screen.getAllByText(/Validado/).length).toBeGreaterThan(0);
  });

  it('marca "Check-in" como ítem activo del sidebar', () => {
    render(<CheckinPage />);
    expect(screen.getByRole('link', { name: 'Check-in' })).toHaveAttribute('aria-current', 'page');
  });
});
