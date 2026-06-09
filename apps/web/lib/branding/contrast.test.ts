import { describe, it, expect } from 'vitest';
import { contrastRatio, textOn, isHex6, strongFill } from './contrast';

describe('contrast', () => {
  it('contrastRatio: blanco/negro = 21:1; simétrico', () => {
    expect(Math.round(contrastRatio('#ffffff', '#000000'))).toBe(21);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('#f39228 con blanco falla AA (~2.35) → textOn elige texto OSCURO', () => {
    expect(contrastRatio('#ffffff', '#f39228')).toBeLessThan(4.5);
    const t = textOn('#f39228');
    expect(t.isDark).toBe(true);
    expect(t.color).not.toBe('#ffffff');
    expect(t.ratio).toBeGreaterThanOrEqual(4.5); // el ink elegido sí pasa AA
  });

  it('#c44400 (brand-strong) con blanco pasa AA → textOn elige BLANCO', () => {
    const t = textOn('#c44400');
    expect(t.isDark).toBe(false);
    expect(t.color).toBe('#ffffff');
    expect(t.whiteRatio).toBeGreaterThanOrEqual(4.5);
  });

  it('isHex6 valida #RRGGBB', () => {
    expect(isHex6('#e65100')).toBe(true);
    expect(isHex6('red')).toBe(false);
    expect(isHex6('#fff')).toBe(false);
  });

  it('strongFill: #c44400 (ya AA) se respeta; #f39228 se oscurece a AA; inválido → fallback', () => {
    expect(strongFill('#c44400')).toBe('#c44400');
    expect(contrastRatio('#ffffff', strongFill('#f39228'))).toBeGreaterThanOrEqual(4.5);
    expect(strongFill('rojo')).toBe('#c44400');
  });
});
