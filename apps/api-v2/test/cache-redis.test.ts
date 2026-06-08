// apps/api-v2/test/cache-redis.test.ts · integration (skip sin REDIS_URL).
// Cache contra Redis REAL: hit/miss, TTL/PTTL en rango, expiración, del,
// aislamiento de keys, y cierre del cliente compartido sin fugas.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { createCache } from '../src/cache.js';
import { getRedisClient, closeRedis } from '../src/redis-client.js';

const REDIS_URL = process.env.REDIS_URL;
const run = REDIS_URL ? describe : describe.skip;

run('Cache · Redis real', () => {
  const prefix = `cachetest-${Date.now()}`;
  let raw: Redis;

  beforeAll(async () => {
    raw = new Redis(REDIS_URL as string, { maxRetriesPerRequest: 2 });
    // Espera a que el cliente COMPARTIDO (lazyConnect + offlineQueue=false) esté
    // listo antes de emitir comandos, para no chocar con la ventana de conexión.
    const shared = getRedisClient();
    if (shared && shared.status !== 'ready') {
      await new Promise<void>((res) => {
        shared.once('ready', () => res());
        shared.once('error', () => res());
      });
    }
  });

  afterAll(async () => {
    const keys = await raw.keys(`${prefix}:*`);
    if (keys.length) await raw.del(...keys);
    await raw.quit();
    await closeRedis(); // cierra el singleton compartido (sin fugas)
  });

  it('miss → loader → cachea; segunda vez hit (sin loader)', async () => {
    const c = createCache({ resolveClient: () => getRedisClient(), prefix, rng: () => 0.5 });
    let calls = 0;
    const loader = async () => { calls += 1; return { n: 1 }; };
    expect(await c.withCache('k1', 5000, loader)).toEqual({ n: 1 });
    expect(await c.withCache('k1', 5000, loader)).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it('TTL (PTTL) queda en el rango del jitter', async () => {
    const c = createCache({ resolveClient: () => getRedisClient(), prefix, jitterRatio: 0.2 });
    await c.set('k2', { x: 1 }, 2000);
    const pttl = await raw.pttl(`${prefix}:k2`);
    expect(pttl).toBeGreaterThan(1500); // 2000*(1-0.2)=1600 con margen de red
    expect(pttl).toBeLessThanOrEqual(2400);
  });

  it('expira: tras un TTL corto, recarga del loader', async () => {
    const c = createCache({ resolveClient: () => getRedisClient(), prefix, rng: () => 0.5 });
    let calls = 0;
    const loader = async () => { calls += 1; return calls; };
    expect(await c.withCache('k3', 150, loader)).toBe(1);
    await new Promise((r) => setTimeout(r, 250));
    expect(await c.withCache('k3', 150, loader)).toBe(2); // venció → recarga
  });

  it('del invalida la entrada', async () => {
    const c = createCache({ resolveClient: () => getRedisClient(), prefix, rng: () => 0.5 });
    await c.set('k4', 'v', 5000);
    expect(await c.get('k4')).toBe('v');
    await c.del('k4');
    expect(await c.get('k4')).toBeUndefined();
  });

  it('aislamiento de keys (distinto prefix → distinta entidad)', async () => {
    const a = createCache({ resolveClient: () => getRedisClient(), prefix: `${prefix}:A` });
    const b = createCache({ resolveClient: () => getRedisClient(), prefix: `${prefix}:B` });
    await a.set('k', 'av', 5000);
    await b.set('k', 'bv', 5000);
    expect(await a.get('k')).toBe('av');
    expect(await b.get('k')).toBe('bv');
  });
});
