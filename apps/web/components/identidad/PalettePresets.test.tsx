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
    expect(screen.getByRole('button', { name: /Paleta Banreservas/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('disabled no dispara onPick', () => {
    const onPick = vi.fn();
    render(<PalettePresets primary="#e65100" accent="#ff6f00" onPick={onPick} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /Paleta Verde/i }));
    expect(onPick).not.toHaveBeenCalled();
  });
});
