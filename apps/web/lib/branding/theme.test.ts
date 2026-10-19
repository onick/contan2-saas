import { describe, it, expect } from 'vitest';
import {
  brandingToCssVars,
  CSS_VAR_BRAND,
  CSS_VAR_BRAND_FG,
  CSS_VAR_BRAND_TEXT,
  CSS_VAR_BRAND_SOFT,
  CSS_VAR_BRAND_ACCENT,
  CSS_VAR_INFO_TEXT,
  CSS_VAR_INFO_SOFT,
  CSS_VAR_FOCUS,
  CSS_VAR_BRAND_STRONG,
} from './theme';
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

  it('brand-strong AA-safe contra blanco', () => {
    const vars = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#f39228' });
    expect(vars[CSS_VAR_BRAND]).toBe('#f39228');
    expect(contrastRatio('#ffffff', vars[CSS_VAR_BRAND_STRONG])).toBeGreaterThanOrEqual(4.5);
  });

  it('produce exactamente las nueve CSS vars esperadas', () => {
    const vars = brandingToCssVars(DEFAULT_BRANDING);
    const expected = [
      CSS_VAR_BRAND,
      CSS_VAR_BRAND_FG,
      CSS_VAR_BRAND_TEXT,
      CSS_VAR_BRAND_SOFT,
      CSS_VAR_BRAND_ACCENT,
      CSS_VAR_INFO_TEXT,
      CSS_VAR_INFO_SOFT,
      CSS_VAR_FOCUS,
      CSS_VAR_BRAND_STRONG,
    ].sort();
    expect(Object.keys(vars).sort()).toEqual(expected);
  });

  it('brand-fg es blanco o ink según contraste del primario', () => {
    const dark = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#f39228' });
    expect(dark[CSS_VAR_BRAND_FG]).toBe('#1f2326'); // naranja claro → texto oscuro
    const light = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#1a1a1a' });
    expect(light[CSS_VAR_BRAND_FG]).toBe('#ffffff'); // fondo oscuro → texto blanco
  });

  it('brand-text cumple AA (≥4.5) sobre blanco para primario #f39228', () => {
    const vars = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#f39228' });
    expect(contrastRatio(vars[CSS_VAR_BRAND_TEXT], '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('info-text cumple AA sobre blanco para secundario #31a3db', () => {
    const vars = brandingToCssVars({ ...DEFAULT_BRANDING, secondaryColor: '#31a3db' });
    expect(contrastRatio(vars[CSS_VAR_INFO_TEXT], '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('focus deriva del secundario (azul CCB) con ≥3:1 sobre blanco, no del naranja', () => {
    const vars = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#f39228', secondaryColor: '#31a3db' });
    expect(vars[CSS_VAR_FOCUS]).toBe('#269ed9');
    expect(contrastRatio(vars[CSS_VAR_FOCUS], '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(vars[CSS_VAR_FOCUS]).not.toBe(vars[CSS_VAR_BRAND_STRONG]);
  });

  it('focus cae a brand-strong si el secundario no es un hex válido', () => {
    const vars = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#f39228', secondaryColor: 'azul' });
    expect(vars[CSS_VAR_FOCUS]).toBe(vars[CSS_VAR_BRAND_STRONG]);
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

  it('el default usa los colores oficiales CCB', () => {
    expect(DEFAULT_BRANDING.primaryColor).toBe('#f39228');
    expect(DEFAULT_BRANDING.secondaryColor).toBe('#31a3db');
  });
});
