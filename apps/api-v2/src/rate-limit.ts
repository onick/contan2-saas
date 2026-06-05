// apps/api-v2/src/rate-limit.ts · rate-limiter detrás de una interfaz pequeña.
//
// Implementación IN-MEMORY (Map). NO usa Redis: a día de hoy la infra v2 no
// tiene Redis. Limitaciones CONOCIDAS y aceptadas para este PR:
//   · single-instance: con múltiples réplicas cada una lleva su propio contador,
//     así que el límite efectivo se multiplica por el número de réplicas.
//   · estado en memoria → los contadores se REINICIAN en cada redeploy/restart.
//
// Migración futura a Redis: implementar esta MISMA interfaz con un store
// compartido (INCR + EXPIRE por ventana) sin tocar ningún call-site.

export interface RateLimitResult {
  limited: boolean;
  retryAfterMs: number; // ms hasta que la ventana se reinicia (0 si no limitado)
}

export interface RateLimiter {
  hit(key: string, now?: number): RateLimitResult;
}

export interface InMemoryRateLimitOptions {
  max: number; // máximo de hits permitidos por ventana
  windowMs: number; // duración de la ventana
}

export function createInMemoryRateLimiter(opts: InMemoryRateLimitOptions): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key: string, now: number = Date.now()): RateLimitResult {
      // GC perezoso de buckets vencidos (evita fuga de memoria con muchas IPs).
      for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
      const cur = buckets.get(key);
      if (!cur || now >= cur.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
        return { limited: false, retryAfterMs: 0 };
      }
      cur.count += 1;
      if (cur.count > opts.max) {
        return { limited: true, retryAfterMs: Math.max(0, cur.resetAt - now) };
      }
      return { limited: false, retryAfterMs: 0 };
    },
  };
}
