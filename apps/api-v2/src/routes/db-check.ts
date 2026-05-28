import type { FastifyPluginAsync } from 'fastify';
import { pingDb } from '@contan2/db';

// GET /api/v2/_internal/db-check · health-check interno de conectividad DB.
//
// Gated: solo se registra si DB_CHECK_ENABLED === 'true'. Desactivado por
// defecto — en producción NO se expone salvo que se setee explícitamente.
// Hace SELECT 1 y devuelve { ok: true }. NO expone versión, host, nombre de
// DB, pool stats ni datos.
export const dbCheckRoute: FastifyPluginAsync = async (app) => {
  if (process.env.DB_CHECK_ENABLED !== 'true') return;

  app.get('/_internal/db-check', async (_req, reply) => {
    try {
      await pingDb();
      return { ok: true };
    } catch {
      reply.code(503);
      return { ok: false };
    }
  });
};
