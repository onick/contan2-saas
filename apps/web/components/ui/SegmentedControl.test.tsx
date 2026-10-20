import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

afterEach(cleanup);

const items = [
  { label: 'Hoy', href: '/app?period=today' },
  { label: '30 días', href: '/app', active: true },
];

describe('SegmentedControl', () => {
  it('variante por defecto: activo en ink, nombre "Segmentos"', () => {
    render(<SegmentedControl items={items} />);
    expect(screen.getByRole('navigation', { name: 'Segmentos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '30 días' }).className).toContain('bg-ink');
  });

  it('variante tray: activo en accent-strong, items de 44 px y nombre propio', () => {
    render(<SegmentedControl items={items} variant="tray" label="Período" />);
    expect(screen.getByRole('navigation', { name: 'Período' })).toBeInTheDocument();
    const active = screen.getByRole('link', { name: '30 días' });
    expect(active.className).toContain('bg-accent-strong');
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Hoy' }).className).toContain('min-h-11');
  });
});
