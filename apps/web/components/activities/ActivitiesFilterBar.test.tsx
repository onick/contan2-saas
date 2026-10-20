import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActivitiesView } from './ActivitiesView';
import { ACTIVITIES } from '../../lib/activities/demoData';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams('') }));

afterEach(cleanup);

const renderView = () => render(<ActivitiesView activities={ACTIVITIES} total={ACTIVITIES.length} />);

describe('ActivitiesView · barra de filtros (piel nueva)', () => {
  it('los pills de estado son botones "Etiqueta (n)" con aria-pressed y activo oscuro', () => {
    renderView();
    const todas = screen.getByRole('button', { name: new RegExp(`^Todas \\(${ACTIVITIES.length}\\)`) });
    expect(todas).toHaveAttribute('aria-pressed', 'true');
    const borrador = screen.getByRole('button', { name: /^Borrador \(\d+\)/ });
    fireEvent.click(borrador);
    expect(borrador).toHaveAttribute('aria-pressed', 'true');
    expect(todas).toHaveAttribute('aria-pressed', 'false');
    expect(borrador.className).toContain('bg-ink');
  });

  it('toggle de vista con aria-pressed y select de categoría con chevron propio', () => {
    renderView();
    const lista = screen.getByRole('button', { name: 'Vista lista' });
    const grid = screen.getByRole('button', { name: 'Vista cuadrícula' });
    expect(lista).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(grid);
    expect(grid).toHaveAttribute('aria-pressed', 'true');
    const select = screen.getByLabelText('Categoría');
    expect(select.id).toBe('act-cat');
    expect(select.className).toContain('appearance-none');
    expect(select.className).toContain('pr-9');
  });
});
