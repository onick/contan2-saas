import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { loadConfig } from '@contan2/config';
import { closeDb, getDb, getPlatformDb, sql } from '@contan2/db';
import { closeRedis } from './redis-client.js';
import { startAutoFinalize } from './services/auto-finalize.js';
import { MAX_COVER_BYTES } from './services/cover-upload.js';
import { uploadsRoute } from './routes/uploads.js';
import { healthzRoute } from './routes/healthz.js';
import { dbCheckRoute } from './routes/db-check.js';
import { authMeRoute } from './routes/auth-me.js';
import { authLoginRoute } from './routes/auth-login.js';
import { platformAuthRoute } from './routes/platform-auth.js';
import { platformAdminRoute } from './routes/platform-admin.js';
import { authSignupRoute } from './routes/auth-signup.js';
import { orgBrandingRoute } from './routes/org-branding.js';
import { dashboardMetricsRoute } from './routes/dashboard-metrics.js';
import { activitiesRoute } from './routes/activities.js';
import { programsRoute } from './routes/programs.js';
import { usersRoute } from './routes/users.js';
import { attendanceRoute } from './routes/attendance.js';
import { checkinRoute } from './routes/checkin.js';
import { puertaRoute } from './routes/puerta.js';
import { puertaBookingsRoute } from './routes/puerta-bookings.js';
import { puertaStatsRoute } from './routes/puerta-stats.js';
import { reportsAgentRoute } from './routes/reports-agent.js';
import { biblioRoute } from './routes/biblio.js';
import { biblioReadersRoute } from './routes/biblio-readers.js';
import { biblioLoansRoute } from './routes/biblio-loans.js';
import { biblioReservationsRoute } from './routes/biblio-reservations.js';
import { reportsRoute } from './routes/reports.js';
import { auditRoute } from './routes/audit.js';
import { teamRoute } from './routes/team.js';
import { credentialsRoute } from './routes/credentials.js';
import { publicRoute } from './routes/public.js';
import { segmentsRoute } from './routes/segments.js';
import { authPasswordRoute } from './routes/auth-password.js';
import { staffInvitationsRoute } from './routes/staff-invitations.js';
import { credentialsBulkRoute } from './routes/credentials-bulk.js';
import { activityInvitationsRoute } from './routes/activity-invitations.js';
import { protocolRoute } from './routes/protocol.js';
import { scannerRoute } from './routes/scanner.js';
import { contactRoute } from './routes/contact.js';
import { shellRoute } from './routes/shell.js';

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

  // Headers de seguridad globales (auditoría 2026-06-10). API JSON: sin CSP de
  // script (no sirve HTML); nosniff + frame DENY + referrer estricto en todo.
  // HSTS lo emite el proxy TLS (Traefik) a nivel de dominio.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
  });

  app.register(cookie);
  // Multipart para subida de portadas. Tope duro de tamaño por archivo (5MB); el
  // endpoint cuenta las partes y exige EXACTAMENTE un archivo (rechaza 0/>1). El
  // límite `files` es sólo un backstop alto (el conteo del handler es el árbitro).
  app.register(multipart, { limits: { fileSize: MAX_COVER_BYTES, fields: 20, files: 4 } });
  // Serving de portadas (S2). SIN prefijo /api/v2: image_url = `/uploads/<name>`.
  app.register(uploadsRoute);
  app.register(healthzRoute, { prefix: '/api/v2' });
  // Gated por DB_CHECK_ENABLED; no registra ruta si está apagado.
  app.register(dbCheckRoute, { prefix: '/api/v2' });
  // Formulario público de la landing (sin tenant scope, sin auth). Antes que
  // los routes tenant-scoped para no pasar por resolveTenant.
  app.register(contactRoute, { prefix: '/api/v2' });
  app.register(authMeRoute, { prefix: '/api/v2' });
  // Login/logout del admin v2 (ESCRITURA · única superficie que escribe en
  // staff_auth_sessions, byte-compatible con v1).
  app.register(authLoginRoute, { prefix: '/api/v2' });
  // Platform admin (super-admin cross-tenant): auth propia (cookie/tabla
  // separadas) + panel. Sin tenant scope.
  app.register(platformAuthRoute, { prefix: '/api/v2' });
  app.register(platformAdminRoute, { prefix: '/api/v2' });
  app.register(authSignupRoute, { prefix: '/api/v2' });
  app.register(authPasswordRoute, { prefix: '/api/v2' });
  app.register(staffInvitationsRoute, { prefix: '/api/v2' });
  app.register(credentialsBulkRoute, { prefix: '/api/v2' });
  app.register(activityInvitationsRoute, { prefix: '/api/v2' });
  app.register(protocolRoute, { prefix: '/api/v2' });
  app.register(orgBrandingRoute, { prefix: '/api/v2' });
  // Endpoints read-only de negocio (tenant-scoped, sesión staff requerida).
  app.register(dashboardMetricsRoute, { prefix: '/api/v2' });
  app.register(shellRoute, { prefix: '/api/v2' });
  app.register(activitiesRoute, { prefix: '/api/v2' });
  app.register(programsRoute, { prefix: '/api/v2' });
  app.register(segmentsRoute, { prefix: '/api/v2' });
  app.register(usersRoute, { prefix: '/api/v2' });
  app.register(attendanceRoute, { prefix: '/api/v2' });
  app.register(checkinRoute, { prefix: '/api/v2' });
  app.register(puertaRoute, { prefix: '/api/v2' });
  app.register(puertaBookingsRoute, { prefix: '/api/v2' });
  app.register(puertaStatsRoute, { prefix: '/api/v2' });
  app.register(reportsAgentRoute, { prefix: '/api/v2' });
  app.register(biblioRoute, { prefix: '/api/v2' });
  app.register(biblioReadersRoute, { prefix: '/api/v2' });
  app.register(biblioLoansRoute, { prefix: '/api/v2' });
  app.register(biblioReservationsRoute, { prefix: '/api/v2' });
  app.register(reportsRoute, { prefix: '/api/v2' });
  app.register(auditRoute, { prefix: '/api/v2' });
  app.register(teamRoute, { prefix: '/api/v2' });
  // PNG público de credencial: ruta NUEVA y LEGACY v1 (/api/credentials/:code.png)
  // — los emails ya enviados por v1 enlazan la legacy (continuidad de credenciales).
  app.register(credentialsRoute, { prefix: '/api/v2' });
  app.register(credentialsRoute, { prefix: '/api' });
  // Slice público read-only (kiosko): tenant por host, SIN auth de staff.
  app.register(publicRoute, { prefix: '/api/v2' });
  // Auth del scanner (gate por PIN de staff → cookie firmada).
  app.register(scannerRoute, { prefix: '/api/v2' });

  // Cierra el pool singleton de @contan2/db + el cliente Redis COMPARTIDO
  // (rate-limit + cache; si se creó) al apagar la app (tests + prod).
  app.addHook('onClose', async () => {
    await closeDb();
    await closeRedis();
  });

  return app;
}

// Fail-fast: si el pool TENANT está sujeto a RLS (rol sin BYPASSRLS ni superuser
// = enforcement activo, DATABASE_URL vira a app_v2) pero NO hay PLATFORM_DATABASE_URL,
// getPlatformDb() cae por fallback al MISMO pool app_v2 → platform-admin vería todo
// vacío y auto-finalize dejaría de finalizar, en silencio. Mejor no arrancar.
async function assertPlatformPoolConfig(): Promise<void> {
  if (process.env.PLATFORM_DATABASE_URL) return; // split configurado → OK
  const { rows } = await sql<{ bypass: boolean; superuser: boolean }>`
    select rolbypassrls as bypass, rolsuper as superuser
      from pg_roles where rolname = current_user
  `.execute(getDb());
  const r = rows[0];
  if (r && !r.bypass && !r.superuser) {
    throw new Error(
      'El pool tenant está sujeto a RLS (rol sin BYPASSRLS) pero PLATFORM_DATABASE_URL ' +
        'no está seteada: platform-admin y auto-finalize operarían cross-org bajo RLS y ' +
        'fallarían en silencio. Seteá PLATFORM_DATABASE_URL al rol owner/bypass.',
    );
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const config = loadConfig();
  const app = buildApp();
  app
    .listen({ port: config.PORT, host: '0.0.0.0' })
    .then(async () => {
      await assertPlatformPoolConfig();
      // Job global cross-org (finaliza actividades de TODOS los tenants por su
      // hora de cierre): usa el pool elevado, NO app_v2 — con RLS activo un
      // UPDATE sin GUC matchearía 0 filas y el job dejaría de finalizar.
      startAutoFinalize(getPlatformDb());
    })
    .catch((err: unknown) => {
      app.log.error(err);
      process.exit(1);
    });
}
