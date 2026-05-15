import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import { config, validateConfig } from './src/config.js';
import { initRepositories, createTenantRepos, CCB_ORG_ID } from './src/db/repositories.js';
import { runBootstrap } from './src/bootstrap.js';
import { seedDatabase } from './src/utils/seed.js';
import { startAutoFinalize } from './src/utils/autoFinalize.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';
import { forceCcbTenant, buildTenantRepos } from './src/middleware/tenantRepos.js';
import { resolveTenant } from './src/middleware/resolveTenant.js';
import { serveHtmlWithBranding } from './src/middleware/serveHtmlWithBranding.js';
import { createTenantRouter } from './src/routes/tenant.js';
import { createUsersRouter } from './src/routes/users.js';
import { createActivitiesRouter } from './src/routes/activities.js';
import { createAttendanceRouter } from './src/routes/attendance.js';
import { createDashboardRouter } from './src/routes/dashboard.js';
import { createPublicRouter } from './src/routes/public.js';
import { createUploadsRouter, UPLOADS_DIR } from './src/routes/uploads.js';
import { createInsightsRouter } from './src/routes/insights.js';
import { createStaffRouter } from './src/routes/staff.js';
import { createCredentialsRouter } from './src/routes/credentials.js';
import { createOrgBrandingRouter } from './src/routes/orgBranding.js';
import { createReportsRouter } from './src/routes/reports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '..', 'frontend');

const app = express();
app.disable('x-powered-by');

validateConfig();

// Init backend (DB pool + migrations en Postgres; load snapshot en memory)
await initRepositories();
await runBootstrap();

// Sprint 2: en memory + Postgres seedeamos actividades por defecto en la org CCB
// si la org está vacía. Esto sustituye al seed legacy.
const ccbRepos = await createTenantRepos(CCB_ORG_ID);
await seedDatabase(ccbRepos);
await ccbRepos.persistNow();

const finalized = await ccbRepos.activities.finalizePastActivities();
if (finalized.length) {
  console.log(`[auto-finalize] ${finalized.length} actividad(es) marcadas como finalizadas al arrancar (org CCB)`);
  await ccbRepos.persist();
}
startAutoFinalize(ccbRepos);

// CORS: en dev (ROOT_DOMAIN=localhost) aceptamos cualquier origen para ergonomía
// de tooling. En producción, solo el ROOT_DOMAIN y sus subdomains.
const corsOriginCheck = (origin, cb) => {
  // Same-origin requests del navegador no envían Origin → permitidos.
  if (!origin) return cb(null, true);
  if (config.ROOT_DOMAIN === 'localhost') return cb(null, true);
  try {
    const u = new URL(origin);
    const host = u.hostname;
    const root = config.ROOT_DOMAIN.toLowerCase();
    if (host === root || host.endsWith('.' + root)) return cb(null, true);
  } catch { /* origin inválida → cae al return false abajo */ }
  // Origen NO permitido: cb(null, false) hace que el cors middleware NO
  // setee los headers Access-Control-Allow-*. El browser bloquea la
  // request del lado del cliente; el server devuelve 200 (porque la
  // respuesta misma no falla, solo no tiene los headers que el browser
  // necesita para confiar en ella). Esto evita tirar 500 en cada
  // preflight desde origen ajeno.
  return cb(null, false);
};
app.use(cors({
  origin: corsOriginCheck,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

// Healthcheck liviano: NO toca DB, NO requiere tenant. Para liveness probes.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use((req, _res, next) => {
  if (req.path === '/healthz') return next(); // no spamear logs con healthchecks
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Persistencia debounced (solo aplica a memory driver)
app.use((req, res, next) => {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isMutation || !req.path.startsWith('/api')) return next();
  res.on('finish', () => {
    if (res.statusCode < 400 && req.repos?.persist) req.repos.persist();
  });
  next();
});

// Static uploads (no requieren tenant en URL, pero el path tendrá org-id en Sprint 6+)
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  immutable: true,
}));

// Tenant resolution + repos (basado en subdomain o custom domain)
app.use('/api', resolveTenant);
app.use('/api', buildTenantRepos);

// Endpoint de branding público (consumido por el frontend para aplicar tema)
app.use('/api/_tenant', createTenantRouter());

// Routers tenant-aware (todos requieren req.organization)
app.use('/api/public', createPublicRouter());
app.use('/api/uploads', createUploadsRouter());
app.use('/api/users', createUsersRouter());
app.use('/api/activities', createActivitiesRouter());
app.use('/api/attendance', createAttendanceRouter());
app.use('/api/dashboard', createDashboardRouter());
app.use('/api/insights', createInsightsRouter());
app.use('/api/staff', createStaffRouter());
app.use('/api/credentials', createCredentialsRouter());
app.use('/api/org/branding', createOrgBrandingRouter());
app.use('/api/reports', createReportsRouter());

app.use('/api', notFoundHandler);

// HTML routes: resolveTenant para tener req.organization y poder inyectar
// el branding SSR (paleta + on-primary) antes del primer paint.
const kioskoHtml = serveHtmlWithBranding(path.join(frontendPath, 'kiosko.html'));
const scannerHtml = serveHtmlWithBranding(path.join(frontendPath, 'scanner.html'));
const rsvpHtml = serveHtmlWithBranding(path.join(frontendPath, 'rsvp.html'));
const indexHtml = serveHtmlWithBranding(path.join(frontendPath, 'index.html'));

app.get(/^\/kiosko(?:\/.*)?$/, resolveTenant, kioskoHtml);
app.get(/^\/scanner(?:\/.*)?$/, resolveTenant, scannerHtml);
app.get(/^\/rsvp(?:\/.*)?$/, resolveTenant, rsvpHtml);

app.use(express.static(frontendPath, {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
  // index:false evita que express.static sirva index.html sin pasar por
  // el middleware de branding SSR.
  index: false,
}));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) return next();
  if (req.path === '/kiosko' || req.path.startsWith('/kiosko/')) {
    return resolveTenant(req, res, () => kioskoHtml(req, res, next));
  }
  if (req.path === '/scanner' || req.path.startsWith('/scanner/')) {
    return resolveTenant(req, res, () => scannerHtml(req, res, next));
  }
  if (req.path === '/rsvp' || req.path.startsWith('/rsvp/')) {
    return resolveTenant(req, res, () => rsvpHtml(req, res, next));
  }
  return resolveTenant(req, res, () => indexHtml(req, res, next));
});

app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  console.log(`contan2-saas escuchando en http://localhost:${config.PORT}`);
  console.log(`DB_DRIVER=${config.DB_DRIVER}`);
});

async function gracefulShutdown(signal) {
  console.log(`\n[shutdown] ${signal} recibido, guardando snapshot…`);
  try {
    if (ccbRepos.persistNow) await ccbRepos.persistNow();
    console.log('[shutdown] snapshot guardado');
  } catch (e) {
    console.error('[shutdown] error guardando snapshot:', e.message);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
