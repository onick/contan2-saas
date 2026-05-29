import { describe, it, expect } from 'vitest';
import { brandingToCssVars, CSS_VAR_BRAND, CSS_VAR_BRAND_ACCENT } from './theme';
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

  it('produce exactamente las dos CSS vars esperadas', () => {
    const vars = brandingToCssVars(DEFAULT_BRANDING);
    expect(Object.keys(vars).sort()).toEqual([CSS_VAR_BRAND, CSS_VAR_BRAND_ACCENT].sort());
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
