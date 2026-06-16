import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActivitiesTable } from './ActivitiesTable';
import { ACTIVITIES } from '../../lib/activities/demoData';

afterEach(cleanup);

describe('ActivitiesTable', () => {
  it('renderiza todas las actividades', () => {
    render(<ActivitiesTable activities={ACTIVITIES} />);
    for (const a of ACTIVITIES) {
      expect(screen.getByText(a.title)).toBeInTheDocument();
    }
  });

  it('muestra el estado de cada actividad', () => {
    render(<ActivitiesTable activities={ACTIVITIES} />);
    expect(screen.getByText('En curso')).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(screen.getAllByText('Próxima').length).toBe(2);
  });

  it('muestra "—" cuando no hay ocupación (borrador)', () => {
    render(<ActivitiesTable activities={ACTIVITIES} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('click en la fila → onView (abre el detalle); la celda de acciones NO lo dispara', () => {
    const onView = vi.fn();
    render(<ActivitiesTable activities={ACTIVITIES} onView={onView} />);
    const first = ACTIVITIES[0]!;
    const row = screen.getByText(first.title).closest('tr')!;
    expect(row.className).toContain('cursor-pointer');
    // click en el cuerpo de la fila (título) → abre detalle
    fireEvent.click(screen.getByText(first.title));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith(first);
    // click en el ojo (dentro de acciones) → llama onView pero NO doble por la fila
    onView.mockClear();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Ver detalle de ${first.title}`) }));
    expect(onView).toHaveBeenCalledTimes(1); // solo el del ojo, no burbujea a la fila
  });

  it('polish sutil: filas escalonadas (tbody app-stagger) + barras app-bar-grow', () => {
    const { container } = render(<ActivitiesTable activities={ACTIVITIES} />);
    expect(container.querySelector('tbody')).toHaveClass('app-stagger');
    expect(container.querySelector('.app-bar-grow')).toBeInTheDocument();
  });
});
