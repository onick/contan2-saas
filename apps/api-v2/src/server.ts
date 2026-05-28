import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig } from '@contan2/config';
import { healthzRoute } from './routes/healthz.js';
import { dbCheckRoute } from './routes/db-check.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.register(healthzRoute, { prefix: '/api/v2' });
  // Gated por DB_CHECK_ENABLED; no registra ruta si está apagado.
  app.register(dbCheckRoute, { prefix: '/api/v2' });

  return app;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const config = loadConfig();
  const app = buildApp();
  app
    .listen({ port: config.PORT, host: '0.0.0.0' })
    .catch((err: unknown) => {
      app.log.error(err);
      process.exit(1);
    });
}
