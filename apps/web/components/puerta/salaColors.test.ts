import { describe, it, expect } from 'vitest';
import { salaColor, salaSeriesColors } from './salaColors';

describe('salaColors · por tipo de sala (PUE-A09)', () => {
  it('VR = azul, exposición = naranja, otra = neutro; kind ausente cae en exposición', () => {
    expect(salaColor('vr').c).toBe('var(--chart-2)');
    expect(salaColor('exposicion').c).toBe('var(--chart-1)');
    expect(salaColor('otra').c).toBe('var(--chart-4)');
    expect(salaColor(undefined).c).toBe('var(--chart-1)');
  });

  it('una sala "otra" con aforo 30 NO se pinta como VR', () => {
    const [c] = salaSeriesColors([{ kind: 'otra', aforo: 30 }]);
    expect(c).not.toBe(salaColor('vr').c);
  });

  it('las series nunca repiten color aunque haya dos salas del mismo tipo', () => {
    const colors = salaSeriesColors([{ kind: 'vr' }, { kind: 'vr' }, { kind: 'exposicion' }]);
    expect(new Set(colors).size).toBe(3);
  });
});
