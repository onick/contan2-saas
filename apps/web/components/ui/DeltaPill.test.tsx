import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DeltaPill } from './DeltaPill';
import { contrastRatio } from '../../lib/branding/contrast';

afterEach(cleanup);

describe('DeltaPill', () => {
  it('subida: verde con signo + y flecha', () => {
    const { container } = render(<DeltaPill value={12} />);
    const el = screen.getByText('+12%');
    expect(el.dataset.dir).toBe('up');
    expect(el.className).toContain('text-success-fg');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('bajada: rojo con signo -', () => {
    render(<DeltaPill value={-6} />);
    const el = screen.getByText('-6%');
    expect(el.dataset.dir).toBe('down');
    expect(el.className).toContain('text-danger-fg');
  });

  it('0 y null: gris, sin flecha; null muestra raya', () => {
    const { container, rerender } = render(<DeltaPill value={0} />);
    expect(screen.getByText('0%').dataset.dir).toBe('flat');
    expect(container.querySelector('svg')).toBeNull();
    rerender(<DeltaPill value={null} />);
    expect(screen.getByText('—').className).toContain('text-muted');
  });

  it('points: muestra pp en vez de %', () => {
    render(<DeltaPill value={-4} unit="points" />);
    expect(screen.getByText('-4 pp')).toBeInTheDocument();
  });

  it('hint queda solo para lectores de pantalla', () => {
    render(<DeltaPill value={3} hint="vs período anterior" />);
    expect(screen.getByText('vs período anterior').className).toContain('sr-only');
  });

  it('onDark usa píldora translúcida con texto blanco', () => {
    render(<DeltaPill value={-6} onDark />);
    const el = screen.getByText('-6%');
    expect(el.className).toContain('bg-white/15');
    expect(el.className).toContain('text-white');
  });

  describe('contraste (tokens por defecto)', () => {
    it('success-fg sobre success-bg, danger-fg sobre danger-bg y muted sobre surface-container ≥4.5', () => {
      expect(contrastRatio('#15803d', '#ecfdf3')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#b91c1c', '#fef2f2')).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#636769', '#f5f5f4')).toBeGreaterThanOrEqual(4.5);
    });

    it('onDark: blanco sobre (15% blanco + accent-strong del CCB) ≥4.5', () => {
      const base = [0x17, 0x5f, 0x82];
      const mix = base.map((c) => Math.round(c * 0.85 + 255 * 0.15));
      const hex = '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('');
      expect(contrastRatio('#ffffff', hex)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
