import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import RegistrosPage from './page';

afterEach(cleanup);

describe('/app/registros', () => {
  it('renderiza encabezado y exportar', () => {
    render(<RegistrosPage />);
    expect(screen.getByRole('heading', { name: 'Registros de asistencia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar/i })).toBeInTheDocument();
  });

  it('renderiza registros con estados', () => {
    render(<RegistrosPage />);
    expect(screen.getByText('Sofía Méndez')).toBeInTheDocument();
    expect(screen.getAllByText('Presente').length).toBeGreaterThan(0);
    expect(screen.getByText('Registrado')).toBeInTheDocument();
    // "No-show" aparece como KPI y como chip de estado.
    expect(screen.getAllByText('No-show').length).toBeGreaterThan(1);
  });

  it('marca "Registros" como ítem activo del sidebar', () => {
    render(<RegistrosPage />);
    expect(screen.getByRole('link', { name: 'Registros' })).toHaveAttribute('aria-current', 'page');
  });
});
