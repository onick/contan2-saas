import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { loadConfig } from '@contan2/config';
import { closeDb } from '@contan2/db';
import { MAX_COVER_BYTES } from './services/cover-upload.js';
import { uploadsRoute } from './routes/uploads.js';
import { healthzRoute } from './routes/healthz.js';
import { dbCheckRoute } from './routes/db-check.js';
import { authMeRoute } from './routes/auth-me.js';
import { orgBrandingRoute } from './routes/org-branding.js';
import { dashboardMetricsRoute } from './routes/dashboard-metrics.js';
import { activitiesRoute } from './routes/activities.js';
import { usersRoute } from './routes/users.js';
import { attendanceRoute } from './routes/attendance.js';
import { publicRoute } from './routes/public.js';
import { scannerRoute } from './routes/scanner.js';

// Detrás de un reverse proxy (Traefik / web-v2), Fastify debe derivar `req.ip`
// del `X-Forwarded-For` en vez del socket (que sería el proxy) — si no, TODOS los
// clientes caen en el mismo bucket de rate-limit (la IP del proxy) y el límite
// queda inservible. Default = 1: confía EXACTAMENTE en el proxy inmediato y toma
// la IP que ESE proxy reenvía. NO usamos `true` porque tomaría el extremo
// izquierdo del XFF, que lo controla el cliente → spoofeable (un atacante rota
// XFF y evade el límite). Override por env `TRUST_PROXY` para topologías con más
// hops (ej. "2") o para apagarlo ("false") en entornos sin proxy.
//
// NOTA: en v2 api-v2 es INTERNO; el tráfico público le llega vía los proxies de
// web-v2. Para que `req.ip` sea la IP real del visitante, web-v2 debe REENVIAR
// `x-forwarded-for` (PR aparte de apps/web). Este cambio es la base necesaria.
export function resolveTrustProxy(env: NodeJS.ProcessEnv = process.env): boolean | number {
  const v = env.TRUST_PROXY?.trim();
  if (v === undefined || v === '') return 1;
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: resolveTrustProxy(),
  });

  app.register(cookie);
  // Multipart para subida de portadas. Tope duro global (defensa) + el endpoint
  // lo re-aplica por request. files:1 → un solo archivo.
  app.register(multipart, { limits: { fileSize: MAX_COVER_BYTES, files: 1, fields: 20 } });
  // Serving de portadas (S2). SIN prefijo /api/v2: image_url = `/uploads/<name>`.
  app.register(uploadsRoute);
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
  // Auth del scanner (gate por PIN de staff → cookie firmada).
  app.register(scannerRoute, { prefix: '/api/v2' });

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
