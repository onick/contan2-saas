import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { loadConfig } from '@contan2/config';
import { closeDb } from '@contan2/db';
import { healthzRoute } from './routes/healthz.js';
import { dbCheckRoute } from './routes/db-check.js';
import { authMeRoute } from './routes/auth-me.js';
import { orgBrandingRoute } from './routes/org-branding.js';
import { dashboardMetricsRoute } from './routes/dashboard-metrics.js';
import { activitiesRoute } from './routes/activities.js';
import { usersRoute } from './routes/users.js';
import { attendanceRoute } from './routes/attendance.js';
import { publicRoute } from './routes/public.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.register(cookie);
  app.register(healthzRoute, { prefix: '/api/v2' });
  // Gated por DB_CHECK_ENABLED; no registra ruta si está apagado.
  app.register(dbCheckRoute, { prefix: '/api/v2' });
  app.register(authMeRoute, { prefix: '/api/v2' });
  app.register(orgBrandingRoute, { prefix: '/api/v2' });
  // Endpoints read-only de negocio (tenant-scoped, sesión staff requerida).
  app.register(dashboardMetricsRoute, { prefix: '/api/v2' });
  app.register(activitiesRoute, { prefix: '/api/v2' });
  app.register(usersRoute, { prefix: '/api/v2' });
  app.register(attendanceRoute, { prefix: '/api/v2' });
  // Slice público read-only (kiosko): tenant por host, SIN auth de staff.
  app.register(publicRoute, { prefix: '/api/v2' });

  // Cierra el pool singleton de @contan2/db al apagar la app (tests + prod).
  app.addHook('onClose', async () => {
    await closeDb();
  });

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
