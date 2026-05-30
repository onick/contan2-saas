import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ActivityList } from './ActivityList';
import { RECENT_ACTIVITIES, ACTIVITIES_MANAGED } from '../../lib/dashboard/demoData';

// globals:false → cleanup explícito entre renders.
afterEach(cleanup);

describe('ActivityList', () => {
  it('muestra todas las actividades recientes', () => {
    render(<ActivityList activities={RECENT_ACTIVITIES} managedCount={ACTIVITIES_MANAGED} />);
    for (const a of RECENT_ACTIVITIES) {
      expect(screen.getByText(a.title)).toBeInTheDocument();
    }
  });

  it('muestra el conteo gestionado en el encabezado', () => {
    render(<ActivityList activities={RECENT_ACTIVITIES} managedCount={ACTIVITIES_MANAGED} />);
    expect(screen.getByText(String(ACTIVITIES_MANAGED))).toBeInTheDocument();
    expect(screen.getByText(/en gestión/i)).toBeInTheDocument();
  });
});
