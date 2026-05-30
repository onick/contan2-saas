import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MetricCard } from './MetricCard';

// globals:false → cleanup explícito entre renders.
afterEach(cleanup);

describe('MetricCard', () => {
  it('renderiza label, valor, unidad y tendencia', () => {
    render(
      <MetricCard
        metric={{ key: 'ocupacion', label: 'Ocupación promedio', value: '57', unit: '%', trend: { dir: 'up', label: '+100%' } }}
      />,
    );
    expect(screen.getByText('Ocupación promedio')).toBeInTheDocument();
    expect(screen.getByText('57')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
    expect(screen.getByText('+100%')).toBeInTheDocument();
  });

  it('omite unidad y tendencia cuando no se proveen', () => {
    render(<MetricCard metric={{ key: 'asistencias', label: 'Asistencias', value: '510' }} />);
    expect(screen.getByText('Asistencias')).toBeInTheDocument();
    expect(screen.getByText('510')).toBeInTheDocument();
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });
});
