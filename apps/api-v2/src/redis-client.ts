// apps/api-v2/src/redis-client.ts · cliente ioredis SINGLETON compartido por el
// rate-limit y la cache. Una sola conexión por proceso.
//
// lazyConnect: NO conecta en el arranque (buildApp no se cuelga si Redis está
// caído). enableOfflineQueue=false + maxRetriesPerRequest=1: los comandos fallan
// RÁPIDO cuando no hay conexión → cada consumidor (rate-limit, cache) cae a su
// fallback. El handler 'error' absorbe los fallos de conexión (warning una vez,
// SIN secretos) para que un 'error' no manejado no tumbe el proceso.

import Redis from 'ioredis';

export type WarnFn = (line: string) => void;
export const defaultWarn: WarnFn = (line) => console.warn(line);

type RedisEnv = { REDIS_URL?: string };

let _client: Redis | null = null;
let _connWarned = false;

// Devuelve el singleton si hay REDIS_URL, o null (→ el consumidor usa su fallback
// in-memory / bypass). El `warn` es inyectable para tests.
export function getRedisClient(env: RedisEnv = process.env, warn: WarnFn = defaultWarn): Redis | null {
  const url = env.REDIS_URL?.trim();
  if (!url) return null;
  if (!_client) {
    _client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    _client.on('error', (err: Error) => {
      if (_connWarned) return;
      _connWarned = true;
      warn(
        JSON.stringify({
          level: 'warn',
          evt: 'redis_conn_error',
          msg: 'Error de conexión a Redis; rate-limit y cache degradan a su fallback.',
          err: err?.message?.slice(0, 120),
        }),
      );
    });
    // Pre-calienta la conexión (no bloqueante): con enableOfflineQueue=false los
    // comandos fallan si la conexión aún no está lista; arrancarla acá evita el
    // "blip" del primer request tras el boot. Si Redis está caído, rechaza →
    // lo absorbe el handler 'error' y los comandos degradan al fallback.
    void _client.connect().catch(() => {});
  }
  return _client;
}

// Cierra el singleton (server onClose / tests). Idempotente. ÚNICO punto de
// cierre del Redis del proceso.
export async function closeRedis(): Promise<void> {
  if (_client) {
    try {
      await _client.quit();
    } catch {
      // best-effort
    }
    _client = null;
    _connWarned = false;
  }
}
