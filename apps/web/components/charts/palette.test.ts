import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from '../../lib/branding/contrast';
import { DEFAULT_BRANDING } from '../../lib/branding/config';
import { brandingToCssVars, CSS_VAR_BRAND, CSS_VAR_CHART_1, CSS_VAR_CHART_2, CSS_VAR_FOCUS } from '../../lib/branding/theme';
import { TYPE_COLOR, PALETTE, chartVar } from './palette';

const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');
const token = (name: string): string => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`token --${name} no es un hex fijo en globals.css`);
  return m[1]!;
};
const SURFACE = token('color-surface');

describe('tokens de gráficas (globals.css)', () => {
  it('chart-1 sigue a la marca y chart-2 al foco/secundario del tenant', () => {
    expect(css).toMatch(/--chart-1:\s*var\(--color-brand\)/);
    expect(css).toMatch(/--chart-2:\s*var\(--color-focus\)/);
    const v = brandingToCssVars({ ...DEFAULT_BRANDING, primaryColor: '#0182a2', secondaryColor: '#34b3d0' });
    expect(v[CSS_VAR_CHART_1]).toBe(v[CSS_VAR_BRAND]);
    expect(v[CSS_VAR_CHART_2]).toBe(v[CSS_VAR_FOCUS]);
  });

  it('chart-3…8 y chart-prev son marcas no textuales: ≥3:1 contra surface', () => {
    for (const n of ['chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8', 'chart-prev']) {
      expect(contrastRatio(token(n), SURFACE), n).toBeGreaterThanOrEqual(3);
    }
  });

  it('chart-3…8 también sirven como texto (≥4.5:1 contra surface)', () => {
    for (const n of ['chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8']) {
      expect(contrastRatio(token(n), SURFACE), n).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('chart-2 (secundario CCB derivado del foco) cumple ≥3:1 contra surface', () => {
    const v = brandingToCssVars(DEFAULT_BRANDING);
    expect(contrastRatio(v[CSS_VAR_CHART_2], SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('el tint violeta (chart-4) tiene texto ≥4.5:1 sobre su fondo suave', () => {
    // chart-4-soft = 14 % de chart-4 sobre blanco.
    const hex = token('chart-4');
    const mix = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.14 + 255 * 0.86));
    const soft = `#${mix.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    expect(contrastRatio(hex, soft)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('palette.ts', () => {
  it('no contiene hex sueltos: todo es var()/color-mix de tokens', () => {
    const all = [...PALETTE, ...Object.values(TYPE_COLOR)];
    for (const c of all) expect(c).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(PALETTE).toHaveLength(8);
  });

  it('mapeo tipo→color estable: cine es siempre la marca (chart-1) y otro el neutro', () => {
    expect(TYPE_COLOR.cine).toBe(chartVar(1));
    expect(TYPE_COLOR.otro).toBe(chartVar(8));
  });
});
