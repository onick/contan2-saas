import { describe, it, expect } from 'vitest';
import { optimizeCover, validateInput, OptimizeError, type CodecFactory, TARGET_BYTES, MAX_INPUT_BYTES } from './optimizeCover';

// Codec FALSO: dimensiones fijas + tamaños de blob por intento (escalera de calidad).
function fakeCodec(width: number, height: number, renderSizes: number[]): CodecFactory {
  return async () => {
    let i = 0;
    return {
      width, height,
      async render() { const size = renderSizes[Math.min(i, renderSizes.length - 1)]!; i += 1; return { size, type: 'image/webp' } as unknown as Blob; },
      dispose() {},
    };
  };
}
const file = (type: string, size: number) => ({ type, size, name: 'x' } as unknown as File);

describe('validateInput', () => {
  it('tipo no permitido → bad_type', () => {
    expect(validateInput({ type: 'image/gif', size: 10 })?.code).toBe('bad_type');
  });
  it('> 25 MB → too_large_input', () => {
    expect(validateInput({ type: 'image/png', size: MAX_INPUT_BYTES + 1 })?.code).toBe('too_large_input');
  });
  it('válido → null', () => {
    expect(validateInput({ type: 'image/webp', size: 1000 })).toBeNull();
  });
});

describe('optimizeCover', () => {
  it('≤5 MB válida → se conserva tal cual (optimized=false)', async () => {
    const f = file('image/jpeg', 3 * 1024 * 1024);
    const r = await optimizeCover(f, fakeCodec(800, 600, []));
    expect(r.optimized).toBe(false);
    expect(r.blob).toBe(f);
    expect(r.finalSize).toBe(f.size);
  });

  it('>5 MB → optimiza por la escalera y queda <5 MB (optimized=true)', async () => {
    // 1er intento 6MB (≥target) → 2do 4MB (<target) gana.
    const r = await optimizeCover(file('image/png', 8 * 1024 * 1024), fakeCodec(4000, 2250, [6 * 1024 * 1024, 4 * 1024 * 1024]));
    expect(r.optimized).toBe(true);
    expect(r.finalSize).toBeLessThan(TARGET_BYTES);
    expect(r.finalSize).toBe(4 * 1024 * 1024);
    expect(r.width).toBe(1600);
    expect(r.height).toBe(900);
  });

  it('dimensiones peligrosas (>40MP) → dangerous_dimensions', async () => {
    await expect(optimizeCover(file('image/jpeg', 10 * 1024 * 1024), fakeCodec(10000, 8000, [1000]))).rejects.toMatchObject({ code: 'dangerous_dimensions' });
  });

  it('no logra bajar de 5 MB en toda la escalera → cannot_reach_target', async () => {
    await expect(optimizeCover(file('image/png', 9 * 1024 * 1024), fakeCodec(2000, 1200, [6 * 1024 * 1024]))).rejects.toMatchObject({ code: 'cannot_reach_target' });
  });

  it('tipo inválido → bad_type sin invocar codec', async () => {
    await expect(optimizeCover(file('image/gif', 1000), fakeCodec(10, 10, []))).rejects.toBeInstanceOf(OptimizeError);
  });

  it('decode falla → propaga OptimizeError decode_failed', async () => {
    const failing: CodecFactory = async () => { throw new OptimizeError('decode_failed', 'No se pudo procesar la imagen.'); };
    await expect(optimizeCover(file('image/jpeg', 8 * 1024 * 1024), failing)).rejects.toMatchObject({ code: 'decode_failed' });
  });
});
