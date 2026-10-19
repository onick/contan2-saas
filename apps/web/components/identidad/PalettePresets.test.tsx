import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PalettePresets, PALETTES } from './PalettePresets';

afterEach(cleanup);

describe('PalettePresets', () => {
  it('renderiza todas las paletas y aplica primario+acento al hacer clic', () => {
    const onPick = vi.fn();
    render(<PalettePresets primary="#e65100" accent="#ff6f00" onPick={onPick} />);
    expect(screen.getAllByRole('button')).toHaveLength(PALETTES.length);
    fireEvent.click(screen.getByRole('button', { name: /Paleta Turquesa/i }));
    expect(onPick).toHaveBeenCalledWith({ name: 'Turquesa', primary: '#0182a2', accent: '#34b3d0' });
  });

  it('marca como seleccionada la paleta que coincide con los colores actuales', () => {
    render(<PalettePresets primary="#0182a2" accent="#34b3d0" onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Paleta Turquesa/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Paleta Oficial CCB/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('el primer preset es la paleta oficial CCB (#f39228 / #31a3db) y se marca al coincidir', () => {
    expect(PALETTES[0]).toEqual({ name: 'Oficial CCB', primary: '#f39228', accent: '#31a3db' });
    render(<PalettePresets primary="#F39228" accent="#31A3DB" onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Paleta Oficial CCB/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('disabled no dispara onPick', () => {
    const onPick = vi.fn();
    render(<PalettePresets primary="#e65100" accent="#ff6f00" onPick={onPick} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /Paleta Verde/i }));
    expect(onPick).not.toHaveBeenCalled();
  });
});
