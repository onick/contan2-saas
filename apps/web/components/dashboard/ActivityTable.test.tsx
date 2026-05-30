import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ActivityTable } from './ActivityTable';
import { RECENT_ACTIVITIES, ACTIVITIES_MANAGED } from '../../lib/dashboard/demoData';

// globals:false → cleanup explícito entre renders.
afterEach(cleanup);

describe('ActivityTable', () => {
  it('muestra todas las actividades recientes', () => {
    render(<ActivityTable activities={RECENT_ACTIVITIES} managedCount={ACTIVITIES_MANAGED} />);
    for (const a of RECENT_ACTIVITIES) {
      expect(screen.getByText(a.title)).toBeInTheDocument();
    }
  });

  it('muestra estados y el conteo gestionado', () => {
    render(<ActivityTable activities={RECENT_ACTIVITIES} managedCount={ACTIVITIES_MANAGED} />);
    expect(screen.getByText(String(ACTIVITIES_MANAGED))).toBeInTheDocument();
    expect(screen.getByText(/en gestión/i)).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
    expect(screen.getByText('Próxima')).toBeInTheDocument();
  });
});
