import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ReportesPage from './page';

afterEach(cleanup);

describe('/app/reportes', () => {
  it('renderiza el generador real y las plantillas', () => {
    render(<ReportesPage />);
    expect(screen.getByRole('heading', { name: 'Reportes' })).toBeInTheDocument();
    // Generador REAL "Asistencia por actividad" (reemplaza al generador demo y a su plantilla)
    expect(screen.getByRole('heading', { name: 'Asistencia por actividad' })).toBeInTheDocument();
    expect(screen.getByText(/Elegí un rango y generá/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Por segmento' })).toBeInTheDocument();
  });

  it('renderiza reportes recientes con descarga', () => {
    render(<ReportesPage />);
    expect(screen.getByRole('heading', { name: 'Reportes recientes' })).toBeInTheDocument();
    expect(screen.getByText('Asistencia · Los Congos de Villa Mella')).toBeInTheDocument();
    expect(screen.getAllByText('Descargar').length).toBeGreaterThan(0);
  });

  it('marca "Reportes" como ítem activo del sidebar', () => {
    render(<ReportesPage />);
    expect(screen.getByRole('link', { name: 'Reportes' })).toHaveAttribute('aria-current', 'page');
  });
});
