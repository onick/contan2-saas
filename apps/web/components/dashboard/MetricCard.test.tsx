import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MetricCard } from './MetricCard';

// globals:false → cleanup explícito entre renders.
afterEach(cleanup);

describe('MetricCard', () => {
  it('renderiza label, valor y hint', () => {
    render(
      <MetricCard metric={{ key: 'asistencias', label: 'Asistencias', value: '510', hint: 'Últimos 30 días' }} />,
    );
    expect(screen.getByText('Asistencias')).toBeInTheDocument();
    expect(screen.getByText('510')).toBeInTheDocument();
    expect(screen.getByText('Últimos 30 días')).toBeInTheDocument();
  });

  it('omite el hint cuando no se provee', () => {
    render(<MetricCard metric={{ key: 'retorno', label: 'Tasa de retorno', value: '23%' }} />);
    expect(screen.getByText('Tasa de retorno')).toBeInTheDocument();
    expect(screen.getByText('23%')).toBeInTheDocument();
  });
});
