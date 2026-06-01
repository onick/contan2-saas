import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
});
