import { describe, it, expect } from 'vitest';
import { contrastRatio, textOn, isHex6, strongFill, textShade } from './contrast';

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

  it('#7e7e7e (tono medio) falla blanco (~4.06) y falla INK (~3.90) → textOn cae a #000000', () => {
    expect(contrastRatio('#ffffff', '#7e7e7e')).toBeLessThan(4.5);
    expect(contrastRatio('#1f2326', '#7e7e7e')).toBeLessThan(4.5);
    const t = textOn('#7e7e7e');
    expect(t.color).toBe('#000000');
    expect(t.ratio).toBeGreaterThanOrEqual(4.5);
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

  describe('textShade', () => {
    it('hex inválido → fallback #b45f0a', () => {
      expect(textShade('rojo')).toBe('#b45f0a');
    });

    it('#f39228 ya NO cumple AA contra blanco → se oscurece', () => {
      const shade = textShade('#f39228');
      expect(contrastRatio(shade, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });

    it('un hex que ya cumple AA no se modifica', () => {
      expect(textShade('#1f2326')).toBe('#1f2326');
    });

    it('respeta bg y min personalizados', () => {
      const shade = textShade('#f39228', '#f5f5f4', 4.5);
      expect(contrastRatio(shade, '#f5f5f4')).toBeGreaterThanOrEqual(4.5);
    });
  });
});
