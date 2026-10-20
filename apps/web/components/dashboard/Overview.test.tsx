import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AttentionStrip, InsightBanner } from './Overview';

afterEach(cleanup);

const warn = { type: 'low_enrollment', severity: 'warning', title: 'Baja inscripción próxima', message: 'Cine tiene 2 de 50.' } as never;
const info = { type: 'no_enrollments', severity: 'info', title: 'Actividades sin inscripciones', message: '3 actividades.' } as never;

describe('AttentionStrip', () => {
  it('una fila por aviso, con título, mensaje y enlace a actividades', () => {
    render(<AttentionStrip insights={[warn, info]} />);
    expect(screen.getByRole('heading', { name: 'Atención hoy' })).toBeInTheDocument();
    expect(screen.getByText('Baja inscripción próxima')).toBeInTheDocument();
    expect(screen.getByText('Actividades sin inscripciones')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /Ver actividades/ });
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute('href')).toBe('/app/actividades');
    expect(links[0]!.className).toContain('min-h-11');
  });

  it('warning → role alert; info → role status', () => {
    render(<AttentionStrip insights={[warn, info]} />);
    expect(screen.getByRole('alert').textContent).toContain('Baja inscripción próxima');
    expect(screen.getByRole('status').textContent).toContain('Actividades sin inscripciones');
  });

  it('sin avisos no renderiza nada', () => {
    const { container } = render(<AttentionStrip insights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('InsightBanner no usa borde de color lateral (side-stripe)', () => {
    const { container } = render(<InsightBanner insight={warn} />);
    expect(container.innerHTML).not.toMatch(/border-l-|border-r-/);
  });
});
