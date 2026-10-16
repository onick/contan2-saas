// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { percentile, summarize } from './ttfb.mjs';

describe('ttfb stats', () => {
  it('percentil por rango más cercano', () => {
    const s = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(s, 50)).toBe(10);
    expect(percentile(s, 75)).toBe(15);
  });
  it('summarize ordena las muestras', () => {
    const r = summarize([5, 1, 3]);
    expect(r).toMatchObject({ n: 3, p50: 3, min: 1, max: 5 });
  });
});
