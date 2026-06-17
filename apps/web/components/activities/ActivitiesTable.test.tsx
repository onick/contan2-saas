import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActivitiesTable } from './ActivitiesTable';
import { ACTIVITIES } from '../../lib/activities/demoData';

afterEach(cleanup);

describe('ActivitiesTable', () => {
  // Cada actividad se ve en tarjeta (mobile) + fila (md+) → getAllByText ≥1.
  it('renderiza todas las actividades', () => {
    render(<ActivitiesTable activities={ACTIVITIES} />);
    for (const a of ACTIVITIES) {
      expect(screen.getAllByText(a.title).length).toBeGreaterThan(0);
    }
  });

  it('muestra el estado de cada actividad', () => {
    render(<ActivitiesTable activities={ACTIVITIES} />);
    expect(screen.getAllByText('En curso').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Borrador').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Próxima').length).toBeGreaterThanOrEqual(2); // 2 actividades (×2 vistas)
  });

  it('muestra "—" cuando no hay ocupación (borrador)', () => {
    render(<ActivitiesTable activities={ACTIVITIES} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('click en la fila → onView (abre el detalle); la celda de acciones NO lo dispara', () => {
    const onView = vi.fn();
    render(<ActivitiesTable activities={ACTIVITIES} onView={onView} />);
    const first = ACTIVITIES[0]!;
    // la fila de la TABLA (md+): el título cuyo ancestro es <tr>.
    const titleInRow = screen.getAllByText(first.title).find((el) => el.closest('tr'))!;
    const row = titleInRow.closest('tr')!;
    expect(row.className).toContain('cursor-pointer');
    // click en el cuerpo de la fila (título) → abre detalle
    fireEvent.click(titleInRow);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith(first);
    // click en el ojo (hay uno en la tarjeta y otro en la fila) → 1 sola vez, no burbujea
    onView.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`Ver detalle de ${first.title}`) })[0]!);
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('polish sutil: filas escalonadas (tbody app-stagger) + barras app-bar-grow', () => {
    const { container } = render(<ActivitiesTable activities={ACTIVITIES} />);
    expect(container.querySelector('tbody')).toHaveClass('app-stagger');
    expect(container.querySelector('.app-bar-grow')).toBeInTheDocument();
  });
});
