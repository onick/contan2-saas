import { describe, it, expect } from 'vitest';
import { brandingToCssVars, CSS_VAR_BRAND, CSS_VAR_BRAND_ACCENT, CSS_VAR_BRAND_STRONG } from './theme';
import { contrastRatio } from './contrast';
import { getLocalBranding, DEFAULT_BRANDING } from './config';

describe('brandingToCssVars', () => {
  it('mapea primaryColor → --color-brand y secondaryColor → --color-brand-accent', () => {
    const vars = brandingToCssVars({
      ...DEFAULT_BRANDING,
      primaryColor: '#112233',
      secondaryColor: '#445566',
    });
    expect(vars[CSS_VAR_BRAND]).toBe('#112233');
    expect(vars[CSS_VAR_BRAND_ACCENT]).toBe('#445566');
  });

  it('deriva --color-brand-strong AA-safe (texto blanco ≥4.5) por tenant', () => {
    // #f39228 (claro) → el strong derivado pasa AA con blanco, aunque el primario no.
    const vars = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#f39228' });
    expect(vars[CSS_VAR_BRAND]).toBe('#f39228'); // el primario se respeta (acento)
    expect(contrastRatio('#ffffff', vars[CSS_VAR_BRAND_STRONG])).toBeGreaterThanOrEqual(4.5);
  });

  it('produce exactamente las tres CSS vars esperadas', () => {
    const vars = brandingToCssVars(DEFAULT_BRANDING);
    expect(Object.keys(vars).sort()).toEqual([CSS_VAR_BRAND, CSS_VAR_BRAND_ACCENT, CSS_VAR_BRAND_STRONG].sort());
  });
});

describe('getLocalBranding', () => {
  it('devuelve el tenant ancla (ccb) por su slug', () => {
    expect(getLocalBranding('ccb')).toEqual(DEFAULT_BRANDING);
  });

  it('cae al default ante un slug desconocido', () => {
    expect(getLocalBranding('inexistente')).toEqual(DEFAULT_BRANDING);
  });

  it('cae al default sin argumento', () => {
    expect(getLocalBranding()).toEqual(DEFAULT_BRANDING);
  });

  it('el default trae logoUrl null (placeholder honesto, sin <img> roto)', () => {
    expect(DEFAULT_BRANDING.logoUrl).toBeNull();
  });
});
