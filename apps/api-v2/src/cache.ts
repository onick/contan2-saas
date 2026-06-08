// apps/api-v2/src/cache.ts · abstracción de cache read-through sobre el cliente
// Redis COMPARTIDO (redis-client). L2-only (sin L1 in-process). Anti-stampede:
// single-flight por key + TTL con jitter. Invalidación explícita por `del`.
// Degradación: Redis caído / sin REDIS_URL → bypass directo al loader (la DB),
// nunca rompe el request. NUNCA cachea PII ni respuestas autenticadas (eso lo
// decide el caller: aquí sólo se guarda lo que se le pasa). Keys namespaced por
// `prefix` (entorno:entidad) — ver endpointPrefix en rate-limit.

import type { Redis } from 'ioredis';
import { getRedisClient, defaultWarn, type WarnFn } from './redis-client.js';

export interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number; // datos corruptos / parse fallido (miss seguro)
  degraded: number; // Redis caído → bypass al loader
  singleflight: number; // requests coalescidos en una sola carga
}

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  withCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T>;
  metrics(): CacheMetrics;
  // Emite las métricas agregadas como log estructurado y las resetea.
  logMetrics(): void;
}

export interface CacheOptions {
  prefix?: string; // namespace de la key (p. ej. `${env}:tenant`)
  jitterRatio?: number; // 0..1 (default 0.15)
  rng?: () => number; // inyectable (default Math.random)
  client?: Redis | null; // override (tests); default = cliente compartido
  resolveClient?: () => Redis | null; // override perezoso (tests)
  warn?: WarnFn;
}

// TTL con jitter: ttl * (1 ± jitterRatio). rng inyectable → testeable. Mínimo 1ms.
export function applyJitter(ttlMs: number, jitterRatio = 0.15, rng: () => number = Math.random): number {
  const delta = (rng() * 2 - 1) * jitterRatio; // [-ratio, +ratio]
  return Math.max(1, Math.round(ttlMs * (1 + delta)));
}

export function createCache(opts: CacheOptions = {}): Cache {
  const prefix = opts.prefix;
  const jitterRatio = opts.jitterRatio ?? 0.15;
  const rng = opts.rng ?? Math.random;
  const warn = opts.warn ?? defaultWarn;
  const resolveClient =
    opts.resolveClient ?? (() => (opts.client !== undefined ? opts.client : getRedisClient()));

  const m: CacheMetrics = { hits: 0, misses: 0, errors: 0, degraded: 0, singleflight: 0 };
  const inflight = new Map<string, Promise<unknown>>();
  let degradedWarned = false;

  const fullKey = (key: string) => (prefix ? `${prefix}:${key}` : key);

  // Warning de degradación: UNA vez por instancia (no inunda logs), SIN secretos
  // (jamás REDIS_URL ni la key).
  const warnDegraded = (err: unknown): void => {
    if (degradedWarned) return;
    degradedWarned = true;
    warn(
      JSON.stringify({
        level: 'warn',
        evt: 'cache_redis_unavailable',
        prefix,
        msg: 'Redis no disponible; la cache hace bypass al loader (DB).',
        err: err instanceof Error ? err.message.slice(0, 120) : undefined,
      }),
    );
  };

  async function get<T>(key: string): Promise<T | undefined> {
    const client = resolveClient();
    if (!client) return undefined;
    let raw: string | null;
    try {
      raw = await client.get(fullKey(key));
    } catch (err) {
      m.degraded += 1;
      warnDegraded(err);
      return undefined; // bypass de lectura
    }
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      m.errors += 1; // dato corrupto → miss seguro
      return undefined;
    }
  }

  async function set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const client = resolveClient();
    if (!client) return;
    let payload: string;
    try {
      payload = JSON.stringify(value);
    } catch {
      m.errors += 1; // valor no serializable → no se cachea (miss en el futuro)
      return;
    }
    try {
      await client.set(fullKey(key), payload, 'PX', applyJitter(ttlMs, jitterRatio, rng));
    } catch (err) {
      m.degraded += 1;
      warnDegraded(err);
    }
  }

  async function del(key: string): Promise<void> {
    const client = resolveClient();
    if (!client) return;
    try {
      await client.del(fullKey(key));
    } catch (err) {
      m.degraded += 1;
      warnDegraded(err);
    }
  }

  async function withCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    // 1) Lectura de cache.
    const cached = await get<T>(key);
    if (cached !== undefined) {
      m.hits += 1;
      return cached;
    }
    m.misses += 1;

    // 2) Single-flight: coalesce cargas concurrentes de la MISMA key en una sola
    //    ejecución del loader (anti-stampede in-process).
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) {
      m.singleflight += 1;
      return pending;
    }
    const p = (async () => {
      const value = await loader();
      await set(key, value, ttlMs); // best-effort (no rompe si Redis cae)
      return value;
    })();
    inflight.set(key, p);
    try {
      return await p;
    } finally {
      inflight.delete(key);
    }
  }

  return {
    get,
    set,
    del,
    withCache,
    metrics: () => ({ ...m }),
    logMetrics: () => {
      warn(JSON.stringify({ level: 'info', evt: 'cache_stats', prefix, ...m }));
      m.hits = m.misses = m.errors = m.degraded = m.singleflight = 0;
    },
  };
}
