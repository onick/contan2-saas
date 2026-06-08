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

import Redis from 'ioredis';

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

// Warning estructurado, una sola vez por proceso. NUNCA incluye secretos
// (jamás REDIS_URL): solo el evento, el prefijo del bucket y el mensaje de error
// acotado. Inyectable para tests.
type WarnFn = (line: string) => void;
const defaultWarn: WarnFn = (line) => console.warn(line);

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

// ── Factory + cliente singleton ───────────────────────────────────────────────
let _client: Redis | null = null;

function getRedisClient(url: string, warn: WarnFn = defaultWarn): Redis {
  if (!_client) {
    // lazyConnect: NO conecta en el arranque (buildApp no se cuelga si Redis está
    // caído). enableOfflineQueue=false + maxRetriesPerRequest=1: los comandos
    // fallan RÁPIDO cuando no hay conexión → el limiter cae al fallback in-memory.
    _client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    let connWarned = false;
    // Sin este handler, un error de conexión sería un 'error' no manejado que
    // podría tumbar el proceso. Lo absorbemos (warning una vez, SIN secretos).
    _client.on('error', (err: Error) => {
      if (!connWarned) {
        connWarned = true;
        warn(
          JSON.stringify({
            level: 'warn',
            evt: 'ratelimit_redis_conn_error',
            msg: 'Error de conexión a Redis; el rate-limit degradará a in-memory.',
            err: err?.message?.slice(0, 120),
          }),
        );
      }
    });
  }
  return _client;
}

// Cierra el cliente Redis (server onClose / tests). Idempotente.
export async function closeRateLimitRedis(): Promise<void> {
  if (_client) {
    try {
      await _client.quit();
    } catch {
      // ignore: cierre best-effort
    }
    _client = null;
  }
}

// Elige el backend según REDIS_URL. Sin REDIS_URL → in-memory (single-instance).
export function createRateLimiter(
  opts: RateLimitOptions,
  env: NodeJS.ProcessEnv = process.env,
): RateLimiter {
  const url = env.REDIS_URL?.trim();
  if (url) return createRedisRateLimiter(getRedisClient(url), opts);
  return createInMemoryRateLimiter(opts);
}
