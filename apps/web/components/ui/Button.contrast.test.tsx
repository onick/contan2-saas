import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';
import { brandingToCssVars, CSS_VAR_BRAND, CSS_VAR_BRAND_FG } from '../../lib/branding/theme';
import { DEFAULT_BRANDING } from '../../lib/branding/config';
import { contrastRatio } from '../../lib/branding/contrast';

// jsdom no resuelve Tailwind ni color-mix: verificamos que el botón use los tokens
// bg-brand / text-brand-fg y calculamos el contraste sobre los valores derivados.
describe('Button primary · contraste con el color del tenant', () => {
  it('usa bg-brand + text-brand-fg (no text-white fijo)', () => {
    render(<Button>Guardar</Button>);
    const cls = screen.getByRole('button', { name: 'Guardar' }).className;
    expect(cls).toContain('bg-brand');
    expect(cls).toContain('text-brand-fg');
    expect(cls).not.toContain('text-white');
  });

  for (const primary of ['#f39228', '#e65100', '#0b2a5b', '#ffeb3b', '#000000', '#ffffff']) {
    it(`texto del CTA ≥4.5:1 con primario ${primary}`, () => {
      const vars = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: primary });
      expect(contrastRatio(vars[CSS_VAR_BRAND_FG], vars[CSS_VAR_BRAND])).toBeGreaterThanOrEqual(4.5);
    });
  }
});
