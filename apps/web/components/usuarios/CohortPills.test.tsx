import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const state = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  usePathname: () => '/app/usuarios',
  useSearchParams: () => state.params,
}));
import { CohortPills } from './CohortPills';

const COUNTS = { all: 100, frequent: 12, new7d: 7, noEmail: 4, noCredential: 9, active: 30, dormant: 25 };
// Botón por su etiqueta exacta (los labels tienen paréntesis → evitamos regex).
const pill = (label: string) => screen.getByText(label).closest('button')!;

beforeEach(() => { state.params = new URLSearchParams(); state.replace = vi.fn(); });
afterEach(cleanup);

describe('CohortPills', () => {
  it('renderiza las 7 cohortes con sus conteos', () => {
    render(<CohortPills counts={COUNTS} />);
    for (const label of ['Todos', 'Frecuentes', 'Nuevos (7 días)', 'Sin email', 'Sin credencial', 'Activos', 'Inactivos']) {
      expect(pill(label)).toBeInTheDocument();
    }
    expect(pill('Frecuentes')).toHaveTextContent('12');
    expect(pill('Inactivos')).toHaveTextContent('25');
  });

  it('marca la cohorte activa de la URL con aria-pressed', () => {
    state.params = new URLSearchParams('cohort=active');
    render(<CohortPills counts={COUNTS} />);
    expect(pill('Activos')).toHaveAttribute('aria-pressed', 'true');
    expect(pill('Todos')).toHaveAttribute('aria-pressed', 'false');
  });

  it('sin cohorte en la URL → "Todos" activo por defecto', () => {
    render(<CohortPills counts={COUNTS} />);
    expect(pill('Todos')).toHaveAttribute('aria-pressed', 'true');
  });

  it('clic en una cohorte reescribe ?cohort= y resetea page', () => {
    state.params = new URLSearchParams('page=4&q=ana');
    render(<CohortPills counts={COUNTS} />);
    fireEvent.click(pill('Frecuentes'));
    expect(state.replace).toHaveBeenCalledWith('/app/usuarios?q=ana&cohort=frequent', { scroll: false });
  });

  it('clic en "Todos" omite cohort de la URL (estado por defecto)', () => {
    state.params = new URLSearchParams('cohort=dormant&page=2');
    render(<CohortPills counts={COUNTS} />);
    fireEvent.click(pill('Todos'));
    expect(state.replace).toHaveBeenCalledWith('/app/usuarios', { scroll: false });
  });

  it('counts=null → pills navegables sin badges de número', () => {
    render(<CohortPills counts={null} />);
    expect(pill('Frecuentes')).not.toHaveTextContent(/\d/);
  });
});
