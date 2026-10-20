import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Users } from 'lucide-react';
import { KpiHero } from './KpiHero';

afterEach(cleanup);

describe('KpiHero', () => {
  it('muestra personas como cifra principal y registros como secundaria, en ese orden', () => {
    const { container } = render(
      <KpiHero tone="dark" label="Asistencias del periodo" value="430" secondary="(420 registros)" delta={-6} tooltipText="Personas." icon={Users} />,
    );
    expect(screen.getByText('430')).toBeInTheDocument();
    expect(screen.getByText('(420 registros)')).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text.indexOf('Asistencias del periodo')).toBeLessThan(text.indexOf('430'));
    expect(text.indexOf('430')).toBeLessThan(text.indexOf('(420 registros)'));
  });

  it('la tarjeta oscura usa el token accent-strong; la cálida brand-soft; la neutra la superficie', () => {
    const { container, rerender } = render(<KpiHero tone="dark" label="A" value="1" delta={0} tooltipText="t" />);
    expect(container.querySelector('section')!.className).toContain('bg-accent-strong');
    expect(container.querySelector('section')!.className).toContain('text-accent-strong-fg');
    rerender(<KpiHero tone="warm" label="A" value="1" delta={0} tooltipText="t" />);
    expect(container.querySelector('section')!.className).toContain('bg-brand-soft');
    rerender(<KpiHero tone="neutral" label="A" value="1" delta={0} tooltipText="t" />);
    expect(container.querySelector('section')!.className).toContain('bg-surface');
  });

  it('pastilla de variación: signo, unidad y versión sobre fondo oscuro', () => {
    const { rerender } = render(<KpiHero tone="dark" label="A" value="1" delta={-6} tooltipText="t" />);
    expect(screen.getByText('-6%').className).toContain('bg-white/15');
    rerender(<KpiHero tone="neutral" label="A" value="32%" delta={-26} tooltipText="t" />);
    expect(screen.getByText('-26%').className).toContain('text-danger-fg');
    rerender(<KpiHero tone="neutral" label="A" value="32%" delta={4} deltaUnit="points" tooltipText="t" />);
    expect(screen.getByText('+4 pp')).toBeInTheDocument();
  });

  it('el botón de info tiene nombre accesible, target de 44 px y abre el tooltip', () => {
    render(<KpiHero tone="neutral" label="Tasa" value="55%" delta={1} tooltipText="Asistencias de personas que ya habían venido." />);
    const btn = screen.getByRole('button', { name: '¿Cómo se calcula?' });
    expect(btn.className).toContain('h-11');
    expect(btn.className).toContain('w-11');
    fireEvent.click(btn);
    expect(screen.getByText('Asistencias de personas que ya habían venido.')).toBeInTheDocument();
  });

  it('el icono grande es decorativo (aria-hidden) y solo aparece en dark/warm', () => {
    const { container, rerender } = render(<KpiHero tone="warm" label="A" value="1" delta={0} tooltipText="t" icon={Users} />);
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThan(1);
    rerender(<KpiHero tone="neutral" label="A" value="1" delta={0} tooltipText="t" icon={Users} />);
    // neutral: solo el icono de info
    expect(container.querySelectorAll('svg').length).toBe(1);
  });
});
