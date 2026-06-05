import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BorderBeam } from './BorderBeam';

afterEach(cleanup);

describe('BorderBeam', () => {
  it('es decorativo (aria-hidden) y no bloquea clics (pointer-events-none)', () => {
    const { container } = render(<BorderBeam />);
    const el = container.querySelector('span');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('border-beam', 'pointer-events-none');
  });

  it('se posiciona como overlay del borde sin layout shift y detrás del contenido', () => {
    const { container } = render(<BorderBeam />);
    const el = container.querySelector('span');
    // absolute inset-0 → sin reservar espacio; rounded-[inherit] → respeta el
    // radio de la card; z-[1] → encima del fondo/cover pero debajo del cuerpo (z-10).
    expect(el).toHaveClass('absolute', 'inset-0', 'z-[1]', 'rounded-[inherit]');
  });

  it('acepta className extra', () => {
    const { container } = render(<BorderBeam className="opacity-80" />);
    expect(container.querySelector('span')).toHaveClass('border-beam', 'opacity-80');
  });
});
