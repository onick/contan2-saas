import { describe, it, expect } from 'vitest';
import { contrastRatio, deriveBrandTokens, softTint } from './contrast';

const PRIMARIES: Record<string, string> = {
  'CCB naranja': '#f39228',
  'CTA admin': '#e65100',
  'azul oscuro': '#0b2a5b',
  'amarillo claro': '#ffeb3b',
  negro: '#000000',
  blanco: '#ffffff',
  'gris medio': '#808080',
  'verde medio': '#2e9e5b',
};

const WHITE = '#ffffff';
const PAGE = '#fafaf9';

describe('deriveBrandTokens · AA para cualquier color de tenant', () => {
  for (const [name, hex] of Object.entries(PRIMARIES)) {
    describe(`${name} ${hex}`, () => {
      const t = deriveBrandTokens(hex);
      it('brand es el color del tenant', () => expect(t.brand).toBe(hex));
      it('brand-fg sobre brand ≥4.5:1 (texto del CTA)', () => {
        expect(contrastRatio(t.brandFg, t.brand)).toBeGreaterThanOrEqual(4.5);
      });
      it('brand-text ≥4.5:1 sobre soft, page y blanco (chips, sidebar, texto chico)', () => {
        for (const bg of [t.brandSoft, PAGE, WHITE]) {
          expect(contrastRatio(t.brandText, bg)).toBeGreaterThanOrEqual(4.5);
        }
      });
      it('brand-strong ≥4.5:1 con texto blanco', () => {
        expect(contrastRatio(WHITE, t.brandStrong)).toBeGreaterThanOrEqual(4.5);
      });
      it('focus = brand-strong y ≥3:1 sobre blanco', () => {
        expect(t.focus).toBe(t.brandStrong);
        expect(contrastRatio(t.focus, WHITE)).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('#f39228: el CTA usa texto oscuro (blanco daría 2.35:1)', () => {
    const t = deriveBrandTokens('#f39228');
    expect(contrastRatio(WHITE, '#f39228')).toBeLessThan(3);
    expect(t.brandFg).not.toBe('#ffffff');
  });

  it('un color oscuro conserva texto blanco', () => {
    expect(deriveBrandTokens('#0b2a5b').brandFg).toBe('#ffffff');
  });

  it('hex inválido cae al naranja del CCB sin romper', () => {
    expect(deriveBrandTokens('nope').brand).toBe('#f39228');
  });

  it('softTint equivale a 10% del color sobre blanco', () => {
    expect(softTint('#000000')).toBe('#e6e6e6');
  });
});
