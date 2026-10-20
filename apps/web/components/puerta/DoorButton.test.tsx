import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio } from '../../lib/branding/contrast';
import { DoorButton } from './DoorButton';

afterEach(() => cleanup());

// Los tokens por defecto viven en globals.css; el test los lee de ahí para que un cambio
// de paleta que rompa AA haga fallar la prueba (PUE-A05).
const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');
const token = (name: string): string => {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} no encontrado`);
  return m[1]!;
};

describe('DoorButton · contraste AA (PUE-A05)', () => {
  it('tono marca: bg-brand con texto brand-fg (nunca blanco)', () => {
    render(<DoorButton>Registrar entrada</DoorButton>);
    const cls = screen.getByRole('button').className;
    expect(cls).toMatch(/\bbg-brand\b/);
    expect(cls).toMatch(/\btext-brand-fg\b/);
    expect(cls).not.toMatch(/text-white/);
    expect(contrastRatio(token('--color-brand-fg'), token('--color-brand'))).toBeGreaterThanOrEqual(4.5);
  });

  it('tono VR: fondo info-text derivado con texto blanco ≥ 4.5:1, sin hex', () => {
    render(<DoorButton tone="vr">Agendar</DoorButton>);
    const cls = screen.getByRole('button').className;
    expect(cls).toMatch(/\bbg-info-text\b/);
    expect(cls).toMatch(/\btext-white\b/);
    expect(cls).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(contrastRatio('#ffffff', token('--color-info-text'))).toBeGreaterThanOrEqual(4.5);
  });

  it('todos los tamaños miden al menos 44 px', () => {
    render(<><DoorButton size="sm">a</DoorButton><DoorButton size="md">b</DoorButton><DoorButton size="lg">c</DoorButton></>);
    for (const b of screen.getAllByRole('button')) expect(b.className).toMatch(/min-h-1[12]/);
  });
});
