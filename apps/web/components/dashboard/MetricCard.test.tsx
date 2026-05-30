import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MetricCard } from './MetricCard';

// globals:false → cleanup explícito entre renders.
afterEach(cleanup);

describe('MetricCard', () => {
  it('renderiza label, valor y unidad', () => {
    render(
      <MetricCard metric={{ key: 'asistencias', label: 'Asistencias', value: '510', unit: 'personas' }} />,
    );
    expect(screen.getByText('Asistencias')).toBeInTheDocument();
    expect(screen.getByText('510')).toBeInTheDocument();
    expect(screen.getByText('personas')).toBeInTheDocument();
  });

  it('omite la unidad cuando no se provee', () => {
    render(<MetricCard metric={{ key: 'retorno', label: 'Tasa de retorno', value: '23%' }} />);
    expect(screen.getByText('Tasa de retorno')).toBeInTheDocument();
    expect(screen.getByText('23%')).toBeInTheDocument();
  });
});
