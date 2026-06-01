import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HistorialPage from './page';

afterEach(cleanup);

describe('/app/historial', () => {
  it('renderiza el encabezado y los grupos por día', () => {
    render(<HistorialPage />);
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hoy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ayer' })).toBeInTheDocument();
  });

  it('muestra eventos de auditoría con actor y objetivo', () => {
    render(<HistorialPage />);
    expect(screen.getByText('actualizó la identidad de marca')).toBeInTheDocument();
    expect(screen.getByText('Suscriptores frecuentes')).toBeInTheDocument();
    expect(screen.getByText(/eventos en los últimos 7 días/)).toBeInTheDocument();
  });

  it('marca "Historial" como ítem activo del sidebar', () => {
    render(<HistorialPage />);
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('aria-current', 'page');
  });
});
