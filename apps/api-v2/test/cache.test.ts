// apps/api-v2/test/cache.test.ts · unit del Cache (sin Redis real). Usa un mock
// in-memory de ioredis y mocks de fallo para cubrir hit/miss/jitter/single-flight/
// degradado/corrupto.

import { describe, it, expect, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { createCache, applyJitter } from '../src/cache.js';

// Mock mínimo de ioredis (get/set/del) con captura del PX.
class FakeRedis {
  store = new Map<string, string>();
  lastPx: number | undefined;
  async get(k: string): Promise<string | null> {
    return this.store.has(k) ? (this.store.get(k) as string) : null;
  }
  async set(k: string, v: string, _mode?: string, px?: number): Promise<'OK'> {
    this.lastPx = px;
    this.store.set(k, v);
    return 'OK';
  }
  async del(k: string): Promise<number> {
    const had = this.store.has(k);
    this.store.delete(k);
    return had ? 1 : 0;
  }
}
const asRedis = (f: FakeRedis) => f as unknown as Redis;

describe('applyJitter', () => {
  it('rng=0 → -ratio; rng=1 → +ratio; rng=0.5 → exacto; siempre ≥1', () => {
    expect(applyJitter(1000, 0.15, () => 0)).toBe(850);
    expect(applyJitter(1000, 0.15, () => 1)).toBe(1150);
    expect(applyJitter(1000, 0.15, () => 0.5)).toBe(1000);
    expect(applyJitter(1, 0.15, () => 0)).toBeGreaterThanOrEqual(1);
  });
  it('queda dentro del rango [ttl*(1-r), ttl*(1+r)] para rng aleatorio', () => {
    for (let i = 0; i < 50; i += 1) {
      const v = applyJitter(2000, 0.2);
      expect(v).toBeGreaterThanOrEqual(1600);
      expect(v).toBeLessThanOrEqual(2400);
    }
  });
});

describe('createCache · get/set/del', () => {
  it('miss → undefined; set → hit; del → vuelve a miss', async () => {
    const fake = new FakeRedis();
    const c = createCache({ client: asRedis(fake), prefix: 'test:e', rng: () => 0.5 });
    expect(await c.get('k')).toBeUndefined();
    await c.set('k', { a: 1 }, 1000);
    expect(await c.get('k')).toEqual({ a: 1 });
    expect(fake.store.has('test:e:k')).toBe(true); // key namespaced por prefix
    await c.del('k');
    expect(await c.get('k')).toBeUndefined();
  });

  it('set aplica TTL con jitter al PX (rng inyectable)', async () => {
    const fake = new FakeRedis();
    const c = createCache({ client: asRedis(fake), rng: () => 0 }); // -15%
    await c.set('k', 1, 1000);
    expect(fake.lastPx).toBe(850);
  });
});

describe('createCache · withCache', () => {
  it('miss carga y cachea; segunda vez es hit (loader NO se repite)', async () => {
    const c = createCache({ client: asRedis(new FakeRedis()), rng: () => 0.5 });
    const loader = vi.fn(async () => ({ v: 42 }));
    expect(await c.withCache('k', 1000, loader)).toEqual({ v: 42 });
    expect(await c.withCache('k', 1000, loader)).toEqual({ v: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
    const m = c.metrics();
    expect(m.hits).toBe(1);
    expect(m.misses).toBe(1);
  });

  it('aislamiento de keys: cargas independientes por key', async () => {
    const c = createCache({ client: asRedis(new FakeRedis()) });
    const la = vi.fn(async () => 'A');
    const lb = vi.fn(async () => 'B');
    expect(await c.withCache('a', 1000, la)).toBe('A');
    expect(await c.withCache('b', 1000, lb)).toBe('B');
    expect(la).toHaveBeenCalledTimes(1);
    expect(lb).toHaveBeenCalledTimes(1);
  });

  it('single-flight: cargas concurrentes de la MISMA key → loader una vez', async () => {
    const c = createCache({ client: null }); // sin Redis: igual coalesce in-process
    let resolve!: (v: number) => void;
    const loader = vi.fn(() => new Promise<number>((r) => { resolve = r; }));
    const p1 = c.withCache('k', 1000, loader);
    const p2 = c.withCache('k', 1000, loader);
    // Deja correr microtasks: ambos pasan el get (miss) y se coalescen en 1 loader.
    await new Promise((r) => setTimeout(r, 0));
    resolve(7);
    expect(await p1).toBe(7);
    expect(await p2).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(c.metrics().singleflight).toBe(1);
  });
});

describe('createCache · degradación y datos corruptos', () => {
  it('Redis caído (get/set lanzan) → bypass al loader, no rompe', async () => {
    const down = {
      get: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:6379'); },
      set: async () => { throw new Error('down'); },
      del: async () => { throw new Error('down'); },
    } as unknown as Redis;
    const c = createCache({ client: down });
    const loader = vi.fn(async () => 'from-db');
    expect(await c.withCache('k', 1000, loader)).toBe('from-db');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(c.metrics().degraded).toBeGreaterThanOrEqual(1);
  });

  it('dato corrupto (JSON inválido) → miss seguro (recarga del loader)', async () => {
    const corrupt = { get: async () => '{no-json', set: async () => 'OK' } as unknown as Redis;
    const c = createCache({ client: corrupt });
    const loader = vi.fn(async () => 'ok');
    expect(await c.withCache('k', 1000, loader)).toBe('ok');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(c.metrics().errors).toBeGreaterThanOrEqual(1);
  });

  it('warning de degradación: UNA vez, estructurado, sin secretos ni la key', async () => {
    const warns: string[] = [];
    const down = { get: async () => { throw new Error('redis down at 1.2.3.4:6379'); } } as unknown as Redis;
    const c = createCache({ client: down, prefix: 'staging:tenant', warn: (l) => warns.push(l) });
    await c.withCache('secret-key-orgX', 1000, async () => 1);
    await c.withCache('secret-key-orgY', 1000, async () => 2);
    expect(warns).toHaveLength(1); // no inunda
    const w = JSON.parse(warns[0]!);
    expect(w.evt).toBe('cache_redis_unavailable');
    expect(w.prefix).toBe('staging:tenant');
    expect(warns[0]).not.toContain('redis://');
    expect(warns[0]).not.toContain('secret-key'); // la key NUNCA va al log
  });
});
