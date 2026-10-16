import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio, textShade } from './contrast';
import { brandingToCssVars, CSS_VAR_BRAND_FG, CSS_VAR_BRAND_TEXT, CSS_VAR_INFO_TEXT, CSS_VAR_FOCUS, CSS_VAR_BRAND_STRONG } from './theme';
import { DEFAULT_BRANDING } from './config';

const PRIMARIES   = ['#f39228', '#e65100', '#0182a2'];
const SECONDARIES = ['#31a3db', '#ff6f00', '#34b3d0'];

const BG_WHITE    = '#ffffff';
const BG_PAGE     = '#fafaf9';
const BG_SURFACE  = '#f5f5f4';

describe('contraste de tokens derivados por tenant', () => {
  for (const primary of PRIMARIES) {
    for (const secondary of SECONDARIES) {
      const vars = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: primary, secondaryColor: secondary });

      describe(`primario ${primary} · secundario ${secondary}`, () => {
        it('brand-fg sobre brand ≥4.5:1', () => {
          expect(contrastRatio(vars[CSS_VAR_BRAND_FG], primary)).toBeGreaterThanOrEqual(4.5);
        });

        it('brand-text sobre blanco ≥4.5:1', () => {
          expect(contrastRatio(vars[CSS_VAR_BRAND_TEXT], BG_WHITE)).toBeGreaterThanOrEqual(4.5);
        });

        it('brand-text sobre page (#fafaf9) ≥4.5:1', () => {
          expect(contrastRatio(vars[CSS_VAR_BRAND_TEXT], BG_PAGE)).toBeGreaterThanOrEqual(4.5);
        });

        it('info-text sobre blanco ≥4.5:1', () => {
          expect(contrastRatio(vars[CSS_VAR_INFO_TEXT], BG_WHITE)).toBeGreaterThanOrEqual(4.5);
        });

        it('focus ≥3:1 sobre blanco (indicador no-textual WCAG 1.4.11)', () => {
          expect(contrastRatio(vars[CSS_VAR_FOCUS], BG_WHITE)).toBeGreaterThanOrEqual(3);
        });

        it('focus === brand-strong', () => {
          expect(vars[CSS_VAR_FOCUS]).toBe(vars[CSS_VAR_BRAND_STRONG]);
        });

        it('brand-strong ≥4.5:1 con texto blanco', () => {
          expect(contrastRatio('#ffffff', vars[CSS_VAR_BRAND_STRONG])).toBeGreaterThanOrEqual(4.5);
        });
      });
    }
  }

  // Tokens fijos de globales.css
  describe('border-strong #636769 (gris logo)', () => {
    const borderStrong = '#636769';

    it('border-strong sobre blanco ≥3:1 (WCAG 1.4.11)', () => {
      expect(contrastRatio(borderStrong, BG_WHITE)).toBeGreaterThanOrEqual(3);
    });

    it('border-strong sobre page (#fafaf9) ≥3:1', () => {
      expect(contrastRatio(borderStrong, BG_PAGE)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('tokens fijos (muted #636769, faint #67697a)', () => {
    const muted = '#636769';
    const faint = '#67697a';

    it('muted sobre blanco ≥4.5:1', () => {
      expect(contrastRatio(muted, BG_WHITE)).toBeGreaterThanOrEqual(4.5);
    });

    it('muted sobre page (#fafaf9) ≥4.5:1', () => {
      expect(contrastRatio(muted, BG_PAGE)).toBeGreaterThanOrEqual(4.5);
    });

    it('muted sobre surface-container (#f5f5f4) ≥4.5:1', () => {
      expect(contrastRatio(muted, BG_SURFACE)).toBeGreaterThanOrEqual(4.5);
    });

    it('faint sobre blanco ≥4.5:1', () => {
      expect(contrastRatio(faint, BG_WHITE)).toBeGreaterThanOrEqual(4.5);
    });

    it('faint sobre page (#fafaf9) ≥4.5:1', () => {
      expect(contrastRatio(faint, BG_PAGE)).toBeGreaterThanOrEqual(4.5);
    });

    it('faint sobre surface-container (#f5f5f4) ≥4.5:1', () => {
      expect(contrastRatio(faint, BG_SURFACE)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('brand-text para #f39228 es #ae5f0a (ratio 4.5–4.8 sobre blanco)', () => {
    it('brand-text calculado para #f39228 está entre 4.5 y 4.8 contra blanco', () => {
      const shade = textShade('#f39228');
      const ratio = contrastRatio(shade, BG_WHITE);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeLessThanOrEqual(4.8);
    });

    it('brandingToCssVars emite focus === brand-strong, más oscuro que brand-text, para #f39228', () => {
      const vars = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#f39228' });
      expect(vars[CSS_VAR_FOCUS]).toBe(vars[CSS_VAR_BRAND_STRONG]);
      expect(contrastRatio(vars[CSS_VAR_BRAND_STRONG], BG_WHITE)).toBeGreaterThanOrEqual(contrastRatio(vars[CSS_VAR_BRAND_TEXT], BG_WHITE));
    });
  });
});

// Pares semánticos fijos (app/globals.css): texto de estado sobre su fondo, y sobre las superficies neutras donde se usan.
describe('pares semánticos success/warning/danger (globals.css)', () => {
  const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');
  const tok = (name: string): string => {
    const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!m) throw new Error(`token --color-${name} no encontrado en globals.css`);
    return m[1]!;
  };
  for (const kind of ['success', 'warning', 'danger'] as const) {
    it(`${kind}-fg sobre ${kind}-bg ≥4.5:1`, () => {
      expect(contrastRatio(tok(`${kind}-fg`), tok(`${kind}-bg`))).toBeGreaterThanOrEqual(4.5);
    });
    it(`${kind}-fg sobre blanco, page y surface ≥4.5:1`, () => {
      for (const bg of [BG_WHITE, BG_PAGE, BG_SURFACE]) {
        expect(contrastRatio(tok(`${kind}-fg`), bg), `${kind}-fg sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
