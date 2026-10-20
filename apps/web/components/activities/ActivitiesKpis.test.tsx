import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ActivitiesKpis } from './ActivitiesKpis';

afterEach(cleanup);

describe('ActivitiesKpis', () => {
  it('total con distribución, leyenda en singular/plural, activas con pastilla y ocupación con barra', () => {
    const { container } = render(<ActivitiesKpis total={21} activas={1} finalizadas={16} canceladas={4} avgOccupancyPct={27} />);
    expect(screen.getByText('Total de actividades')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('1 activa · 16 finalizadas · 4 canceladas')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('27%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Ocupación promedio' })).toHaveAttribute('aria-valuenow', '27');
    const tones = [...container.querySelectorAll('section')].map((s) => s.getAttribute('data-tone'));
    expect(tones).toEqual(['dark', 'warm', 'neutral']);
    // Sin botón de info.
    expect(screen.queryByRole('button', { name: '¿Cómo se calcula?' })).toBeNull();
  });

  it('sin activas muestra "Sin activas" y plurales correctos', () => {
    render(<ActivitiesKpis total={3} activas={0} finalizadas={1} canceladas={2} avgOccupancyPct={0} />);
    expect(screen.getByText('Sin activas')).toBeInTheDocument();
    expect(screen.getByText('0 activas · 1 finalizada · 2 canceladas')).toBeInTheDocument();
  });
});
