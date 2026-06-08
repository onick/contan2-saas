// apps/api-v2/src/rate-limit.ts · rate-limiter detrás de una interfaz pequeña.
//
// La interfaz es ASÍNCRONA (`hit` devuelve Promise) para admitir un backend
// distribuido (Redis), cuyas operaciones son async. Dos implementaciones:
//   · in-memory (Map): por defecto. Single-instance — con varias réplicas cada
//     una lleva su propio contador y el estado se REINICIA en cada redeploy.
//   · Redis: estado COMPARTIDO entre réplicas, persistente a redeploys. Ventana
//     fija atómica vía un script Lua (INCR + PEXPIRE al primer hit + PTTL).
//
// `createRateLimiter` elige según REDIS_URL, sin que los call-sites cambien.

import type { Redis } from 'ioredis';
import { getRedisClient, defaultWarn, type WarnFn } from './redis-client.js';

export interface RateLimitResult {
  limited: boolean;
  retryAfterMs: number; // ms hasta que la ventana se reinicia (0 si no limitado)
}

export interface RateLimiter {
  hit(key: string): Promise<RateLimitResult>;
}

export interface RateLimitOptions {
  max: number; // máximo de hits permitidos por ventana
  windowMs: number; // duración de la ventana
  prefix?: string; // namespacing de la key (login vs scanner vs …)
}

// Prefijo de endpoint con namespace por ENTORNO. Evita colisiones de contadores
// si staging y producción compartieran un Redis: la key Redis final queda
// `${env}:${name}:${tenantId}:${ip}` (entorno · endpoint · tenant · ip). Sin
// NODE_ENV (dev local) → 'dev'. La key NUNCA lleva email/código/PIN/token (PII).
export function endpointPrefix(name: string, env: { NODE_ENV?: string } = process.env): string {
  return `${env.NODE_ENV ?? 'dev'}:${name}`;
}

// ── In-memory ───────────────────────────────────────────────────────────────
// `clock` inyectable para tests deterministas (default Date.now).
export function createInMemoryRateLimiter(
  opts: RateLimitOptions & { clock?: () => number },
): RateLimiter {
  const now = opts.clock ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key: string): Promise<RateLimitResult> {
      const t = now();
      // GC perezoso de buckets vencidos (evita fuga de memoria con muchas IPs).
      for (const [k, b] of buckets) if (t >= b.resetAt) buckets.delete(k);
      const cur = buckets.get(key);
      if (!cur || t >= cur.resetAt) {
        buckets.set(key, { count: 1, resetAt: t + opts.windowMs });
        return { limited: false, retryAfterMs: 0 };
      }
      cur.count += 1;
      if (cur.count > opts.max) {
        return { limited: true, retryAfterMs: Math.max(0, cur.resetAt - t) };
      }
      return { limited: false, retryAfterMs: 0 };
    },
  };
}

// ── Redis ────────────────────────────────────────────────────────────────────
// Ventana fija atómica: INCR del contador y, sólo en el primer hit, PEXPIRE con
// la ventana; PTTL devuelve el tiempo restante para `retry-after`. Atómico → sin
// carreras entre réplicas.
const FIXED_WINDOW_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

// Warning estructurado, una sola vez por limiter. NUNCA incluye secretos (jamás
// REDIS_URL ni la key): solo evento, prefijo y mensaje de error acotado.
// WarnFn/defaultWarn viven en redis-client (compartidos).
export function createRedisRateLimiter(
  client: Redis,
  opts: RateLimitOptions,
  warn: WarnFn = defaultWarn,
): RateLimiter {
  const prefix = opts.prefix ?? 'rl';
  // Fallback in-memory para DEGRADAR si Redis falla (no romper requests).
  const fallback = createInMemoryRateLimiter(opts);
  let warned = false;
  const degrade = (err: unknown): void => {
    if (warned) return;
    warned = true;
    warn(
      JSON.stringify({
        level: 'warn',
        evt: 'ratelimit_redis_unavailable',
        prefix,
        msg: 'Redis no disponible; rate-limit degrada a in-memory (single-instance).',
        err: err instanceof Error ? err.message.slice(0, 120) : undefined,
      }),
    );
  };
  return {
    async hit(key: string): Promise<RateLimitResult> {
      try {
        const out = (await client.eval(
          FIXED_WINDOW_LUA,
          1,
          `${prefix}:${key}`,
          String(opts.windowMs),
        )) as [number | string, number | string];
        const current = Number(out[0]);
        const ttl = Number(out[1]);
        if (current > opts.max) {
          return { limited: true, retryAfterMs: ttl > 0 ? ttl : opts.windowMs };
        }
        return { limited: false, retryAfterMs: 0 };
      } catch (err) {
        // Redis caído/degradado: warning una vez + fallback in-memory. El
        // request sigue funcionando (fail-safe, no fail-closed).
        degrade(err);
        return fallback.hit(key);
      }
    },
  };
}

// Elige el backend usando el cliente Redis COMPARTIDO (redis-client). Sin
// REDIS_URL → getRedisClient devuelve null → in-memory (single-instance). El
// cierre del cliente es único (closeRedis en redis-client, llamado en onClose).
export function createRateLimiter(
  opts: RateLimitOptions,
  env: NodeJS.ProcessEnv = process.env,
): RateLimiter {
  const client = getRedisClient(env);
  if (client) return createRedisRateLimiter(client, opts);
  return createInMemoryRateLimiter(opts);
}
