// apps/api-v2/test/rate-limit-redis.test.ts · integration (skip sin REDIS_URL).
// Verifica el limiter Redis (ventana fija atómica): cuenta compartida, límite y
// retry-after. Usa una key namespaced única por corrida y limpia al final.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { createRedisRateLimiter } from '../src/rate-limit.js';

const REDIS_URL = process.env.REDIS_URL;
const run = REDIS_URL ? describe : describe.skip;

run('createRedisRateLimiter', () => {
  let client: Redis;
  const prefix = `rltest-${Date.now()}`;

  beforeAll(() => {
    client = new Redis(REDIS_URL as string, { maxRetriesPerRequest: 2 });
  });

  afterAll(async () => {
    // Limpia las keys creadas por la corrida.
    const keys = await client.keys(`${prefix}:*`);
    if (keys.length) await client.del(...keys);
    await client.quit();
  });

  it('permite hasta `max`, limita el siguiente y da retryAfterMs > 0', async () => {
    const rl = createRedisRateLimiter(client, { max: 3, windowMs: 5000, prefix });
    const key = 'ip-a';
    expect((await rl.hit(key)).limited).toBe(false); // 1
    expect((await rl.hit(key)).limited).toBe(false); // 2
    expect((await rl.hit(key)).limited).toBe(false); // 3
    const fourth = await rl.hit(key); // 4 > max
    expect(fourth.limited).toBe(true);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
    expect(fourth.retryAfterMs).toBeLessThanOrEqual(5000);
  });

  it('claves distintas → contadores independientes', async () => {
    const rl = createRedisRateLimiter(client, { max: 1, windowMs: 5000, prefix });
    expect((await rl.hit('ip-b')).limited).toBe(false);
    expect((await rl.hit('ip-c')).limited).toBe(false); // otra key, su contador
    expect((await rl.hit('ip-b')).limited).toBe(true); // segunda de b supera max=1
  });

  it('la ventana expira: tras PEXPIRE corto, el contador se reinicia', async () => {
    const rl = createRedisRateLimiter(client, { max: 1, windowMs: 150, prefix });
    expect((await rl.hit('ip-d')).limited).toBe(false);
    expect((await rl.hit('ip-d')).limited).toBe(true);
    await new Promise((r) => setTimeout(r, 250)); // deja vencer la ventana
    expect((await rl.hit('ip-d')).limited).toBe(false); // contador nuevo
  });

  it('DOS INSTANCIAS sobre el MISMO Redis comparten el contador (cross-réplica)', async () => {
    // Simula dos réplicas del servicio apuntando al mismo Redis/prefijo.
    const inst1 = createRedisRateLimiter(client, { max: 2, windowMs: 5000, prefix });
    const inst2 = createRedisRateLimiter(client, { max: 2, windowMs: 5000, prefix });
    const key = 'shared-ip';
    expect((await inst1.hit(key)).limited).toBe(false); // 1 (réplica 1)
    expect((await inst2.hit(key)).limited).toBe(false); // 2 (réplica 2, mismo contador)
    expect((await inst1.hit(key)).limited).toBe(true); // 3 > max → limita (estado compartido)
  });

  it('aislamiento por tenant también en Redis (keys distintas)', async () => {
    const rl = createRedisRateLimiter(client, { max: 1, windowMs: 5000, prefix });
    expect((await rl.hit('orgA:ip')).limited).toBe(false);
    expect((await rl.hit('orgB:ip')).limited).toBe(false); // otro tenant
    expect((await rl.hit('orgA:ip')).limited).toBe(true);
  });
});
