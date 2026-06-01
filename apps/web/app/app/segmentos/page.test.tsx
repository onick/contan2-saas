import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SegmentosPage from './page';

afterEach(cleanup);

describe('/app/segmentos', () => {
  it('renderiza encabezado y "Nuevo segmento"', () => {
    render(<SegmentosPage />);
    expect(screen.getByRole('heading', { name: 'Segmentos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo segmento/i })).toBeInTheDocument();
  });

  it('renderiza las tarjetas de segmento', () => {
    render(<SegmentosPage />);
    expect(screen.getByRole('heading', { name: 'Recurrentes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invitados VIP' })).toBeInTheDocument();
    expect(screen.getByText('Estático')).toBeInTheDocument();
    expect(screen.getAllByText('Dinámico').length).toBeGreaterThan(0);
  });

  it('marca "Segmentos" como ítem activo del sidebar', () => {
    render(<SegmentosPage />);
    expect(screen.getByRole('link', { name: 'Segmentos' })).toHaveAttribute('aria-current', 'page');
  });
});
