// =============================================================================
// rateLimit.js · in-memory rate limiter sliding por IP.
// Suficiente para single-instance. Para multi-replica usar Redis (Wave 3).
// =============================================================================

import { HttpError } from '../middleware/errorHandler.js';

/**
 * Crea un middleware de rate limit.
 * @param opts.windowMs ventana en ms (default 60s)
 * @param opts.max requests permitidos por IP en la ventana
 * @param opts.message mensaje del error 429 al cliente
 * @param opts.key (opcional) función para derivar la clave en vez de IP
 */
export function rateLimit({
  windowMs = 60_000,
  max = 30,
  message = 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
  key,
} = {}) {
  const buckets = new Map(); // key -> { count, resetAt }

  // Cleanup periódico de entradas muertas
  const cleanupHandle = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of buckets) {
      if (e.resetAt < now - windowMs) buckets.delete(k);
    }
  }, Math.max(windowMs * 5, 5 * 60_000));
  cleanupHandle.unref();

  return function rateLimitMiddleware(req, _res, next) {
    const k = key ? key(req) : (req.ip || req.socket?.remoteAddress || 'unknown');
    const now = Date.now();
    const entry = buckets.get(k) || { count: 0, resetAt: now + windowMs };
    if (entry.resetAt < now) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    buckets.set(k, entry);
    if (entry.count > max) {
      return next(new HttpError(429, message));
    }
    next();
  };
}
