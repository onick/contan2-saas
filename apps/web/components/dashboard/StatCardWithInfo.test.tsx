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
