import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { ActivitiesView } from './ActivitiesView';
import { ACTIVITIES } from '../../lib/activities/demoData';

afterEach(cleanup);

const renderView = () => render(<ActivitiesView activities={ACTIVITIES} total={ACTIVITIES.length} />);

describe('ActivitiesView · interacciones (sin escrituras)', () => {
  it('no rompe el render: muestra todas las actividades', () => {
    renderView();
    for (const a of ACTIVITIES) expect(screen.getByText(a.title)).toBeInTheDocument();
  });

  it('búsqueda filtra la tabla', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Buscar actividad'), { target: { value: 'congos' } });
    expect(screen.getByText('Los Congos de Villa Mella')).toBeInTheDocument();
    expect(screen.queryByText('Taller de Serigrafía')).not.toBeInTheDocument();
  });

  it('pill de estado filtra (Borrador → solo borradores)', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Borrador/ }));
    expect(screen.getByText('Taller de Serigrafía')).toBeInTheDocument();
    expect(screen.queryByText('Los Congos de Villa Mella')).not.toBeInTheDocument();
  });

  it('categoría filtra (Cine → solo cine)', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Cine' } });
    expect(screen.getByText('5to Ciclo de Cine Dominicano · Kacimiro')).toBeInTheDocument();
    expect(screen.getByText('Cine Clásico · Perdición')).toBeInTheDocument();
    expect(screen.queryByText('Los Congos de Villa Mella')).not.toBeInTheDocument();
  });

  it('fecha filtra (Próximas → empty state, todas las demo son pasadas)', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: 'proximas' } });
    expect(screen.getByText('Sin actividades')).toBeInTheDocument();
  });

  it('toggle lista ↔ grid cambia la vista', () => {
    const { container } = renderView();
    expect(container.querySelector('table')).toBeInTheDocument(); // lista por defecto
    fireEvent.click(screen.getByRole('button', { name: 'Vista cuadrícula' }));
    expect(container.querySelector('table')).not.toBeInTheDocument(); // grid: sin tabla
    expect(screen.getByText('Los Congos de Villa Mella')).toBeInTheDocument(); // datos siguen
  });

  it('"Ver" abre el drawer de detalle read-only', () => {
    renderView();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver' })[0]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Detalle de actividad')).toBeInTheDocument();
    // cierra con Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('empty state cuando no hay resultados', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Buscar actividad'), { target: { value: 'zzzzznada' } });
    expect(screen.getByText('Sin actividades')).toBeInTheDocument();
  });
});
