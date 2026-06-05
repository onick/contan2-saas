// apps/api-v2/test/rate-limit.test.ts · unit (sin DB). Limiter in-memory detrás
// de la interfaz RateLimiter. `now` inyectable para tests deterministas.

import { describe, it, expect } from 'vitest';
import { createInMemoryRateLimiter } from '../src/rate-limit.js';

describe('createInMemoryRateLimiter', () => {
  it('permite hasta `max` y limita el siguiente', () => {
    const rl = createInMemoryRateLimiter({ max: 3, windowMs: 1000 });
    const now = 0;
    expect(rl.hit('ip', now).limited).toBe(false); // 1
    expect(rl.hit('ip', now).limited).toBe(false); // 2
    expect(rl.hit('ip', now).limited).toBe(false); // 3
    const fourth = rl.hit('ip', now); // 4 > max
    expect(fourth.limited).toBe(true);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it('claves distintas → buckets independientes', () => {
    const rl = createInMemoryRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.hit('a', 0).limited).toBe(false);
    expect(rl.hit('b', 0).limited).toBe(false); // otra IP, su propio bucket
    expect(rl.hit('a', 0).limited).toBe(true); // segunda de 'a' supera max=1
  });

  it('la ventana se reinicia al pasar windowMs', () => {
    const rl = createInMemoryRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.hit('ip', 0).limited).toBe(false);
    expect(rl.hit('ip', 500).limited).toBe(true); // dentro de la ventana
    expect(rl.hit('ip', 1000).limited).toBe(false); // ventana nueva
  });

  it('retryAfterMs refleja el tiempo restante de la ventana', () => {
    const rl = createInMemoryRateLimiter({ max: 1, windowMs: 1000 });
    rl.hit('ip', 0);
    expect(rl.hit('ip', 300).retryAfterMs).toBe(700);
  });
});
