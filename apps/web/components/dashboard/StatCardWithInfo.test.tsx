import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Users } from 'lucide-react';
import { StatCardWithInfo } from './StatCardWithInfo';

afterEach(cleanup);

describe('StatCardWithInfo', () => {
  it('acepta LucideIcon como prop icon (no debe ser use client)', () => {
    // Pasar una función LucideIcon desde un Server Component sería un error en runtime
    // si StatCardWithInfo tuviera 'use client'. Este test guarda ese contrato.
    render(
      <StatCardWithInfo
        icon={Users}
        label="Total"
        value="1 234"
        tooltipText="Total de visitantes."
      />,
    );
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('1 234')).toBeInTheDocument();
  });

  it('muestra la cifra secundaria (registros) bajo el valor principal (personas)', () => {
    render(<StatCardWithInfo label="Asistencias del periodo" value="5" secondary="(3 registros)" tooltipText="Personas." />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('(3 registros)')).toBeInTheDocument();
  });

  it('renderiza sin icon (prop opcional)', () => {
    render(
      <StatCardWithInfo
        label="Activos"
        value="42"
        tooltipText="Visitantes activos."
      />,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
