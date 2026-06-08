// apps/api-v2/test/rate-limit.test.ts · unit (sin DB/Redis). Limiter in-memory
// detrás de la interfaz async RateLimiter. `clock` inyectable → determinista.

import { describe, it, expect } from 'vitest';
import type { Redis } from 'ioredis';
import {
  createInMemoryRateLimiter,
  createRateLimiter,
  createRedisRateLimiter,
  endpointPrefix,
} from '../src/rate-limit.js';

describe('createInMemoryRateLimiter', () => {
  it('permite hasta `max` y limita el siguiente', async () => {
    const rl = createInMemoryRateLimiter({ max: 3, windowMs: 1000, clock: () => 0 });
    expect((await rl.hit('ip')).limited).toBe(false); // 1
    expect((await rl.hit('ip')).limited).toBe(false); // 2
    expect((await rl.hit('ip')).limited).toBe(false); // 3
    const fourth = await rl.hit('ip'); // 4 > max
    expect(fourth.limited).toBe(true);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it('claves distintas → buckets independientes', async () => {
    const rl = createInMemoryRateLimiter({ max: 1, windowMs: 1000, clock: () => 0 });
    expect((await rl.hit('a')).limited).toBe(false);
    expect((await rl.hit('b')).limited).toBe(false); // otra IP, su propio bucket
    expect((await rl.hit('a')).limited).toBe(true); // segunda de 'a' supera max=1
  });

  it('la ventana se reinicia al pasar windowMs', async () => {
    let t = 0;
    const rl = createInMemoryRateLimiter({ max: 1, windowMs: 1000, clock: () => t });
    expect((await rl.hit('ip')).limited).toBe(false);
    t = 500;
    expect((await rl.hit('ip')).limited).toBe(true); // dentro de la ventana
    t = 1000;
    expect((await rl.hit('ip')).limited).toBe(false); // ventana nueva
  });

  it('retryAfterMs refleja el tiempo restante de la ventana', async () => {
    let t = 0;
    const rl = createInMemoryRateLimiter({ max: 1, windowMs: 1000, clock: () => t });
    await rl.hit('ip');
    t = 300;
    expect((await rl.hit('ip')).retryAfterMs).toBe(700);
  });
});

describe('endpointPrefix (namespace por entorno)', () => {
  it('prefija con NODE_ENV; sin NODE_ENV → dev', () => {
    expect(endpointPrefix('scanner-pin', { NODE_ENV: 'staging' })).toBe('staging:scanner-pin');
    expect(endpointPrefix('public-checkin', { NODE_ENV: 'production' })).toBe('production:public-checkin');
    expect(endpointPrefix('login', {})).toBe('dev:login');
  });
});

describe('aislamiento por tenant y por endpoint', () => {
  it('tenant: misma IP, distinto orgId → contadores independientes (key)', async () => {
    const rl = createInMemoryRateLimiter({ max: 1, windowMs: 1000, clock: () => 0 });
    expect((await rl.hit('orgA:1.1.1.1')).limited).toBe(false);
    expect((await rl.hit('orgB:1.1.1.1')).limited).toBe(false); // otro tenant, su bucket
    expect((await rl.hit('orgA:1.1.1.1')).limited).toBe(true); // 2ª de orgA supera max=1
  });

  it('endpoint: instancias separadas (scanner vs checkin) no comparten estado', async () => {
    const scanner = createInMemoryRateLimiter({ max: 1, windowMs: 1000, clock: () => 0 });
    const checkin = createInMemoryRateLimiter({ max: 1, windowMs: 1000, clock: () => 0 });
    expect((await scanner.hit('org:ip')).limited).toBe(false);
    expect((await checkin.hit('org:ip')).limited).toBe(false); // otro endpoint
    expect((await scanner.hit('org:ip')).limited).toBe(true); // 2ª en scanner
  });
});

describe('createRateLimiter (factory)', () => {
  it('sin REDIS_URL → in-memory (funciona sin Redis)', async () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 }, {});
    expect((await rl.hit('x')).limited).toBe(false);
    expect((await rl.hit('x')).limited).toBe(true);
  });
});

describe('createRedisRateLimiter · degradación con Redis caído', () => {
  // Cliente simulado cuyo eval SIEMPRE falla (Redis no disponible).
  const downClient = {
    eval: async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
    },
  } as unknown as Redis;

  it('Redis caído → NO lanza; degrada a in-memory (sigue limitando)', async () => {
    const warns: string[] = [];
    const limiter = createRedisRateLimiter(downClient, { max: 2, windowMs: 1000 }, (l) =>
      warns.push(l),
    );
    // El request sigue funcionando (fail-safe): cuenta en memoria.
    expect((await limiter.hit('ip')).limited).toBe(false); // 1
    expect((await limiter.hit('ip')).limited).toBe(false); // 2
    expect((await limiter.hit('ip')).limited).toBe(true); // 3 > max → limita
  });

  it('emite UN warning estructurado, sin secretos (sin redis://)', async () => {
    const warns: string[] = [];
    const limiter = createRedisRateLimiter(downClient, { max: 5, windowMs: 1000, prefix: 'login' }, (l) =>
      warns.push(l),
    );
    await limiter.hit('a');
    await limiter.hit('b');
    await limiter.hit('c');
    // una sola vez por proceso, no spam.
    expect(warns).toHaveLength(1);
    const w = JSON.parse(warns[0]!);
    expect(w.level).toBe('warn');
    expect(w.evt).toBe('ratelimit_redis_unavailable');
    expect(w.prefix).toBe('login');
    // NUNCA filtra la URL/credenciales de Redis.
    expect(warns[0]).not.toContain('redis://');
  });
});
