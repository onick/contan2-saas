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
import { createOrgDomainRouter } from './src/routes/orgDomain.js';
import { createAuthRouter } from './src/routes/auth.js';
import { createPlatformAuthRouter } from './src/routes/platformAuth.js';
import { createReportsRouter } from './src/routes/reports.js';
import { createEventosPublicRouter } from './src/routes/eventosPublic.js';
import { createLandingRouter } from './src/routes/landing.js';

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

// Platform admin endpoints — DEBEN ir antes del buildTenantRepos porque
// el platform admin NO pertenece a ningún tenant (req.organizationId = null).
// resolveTenant sí los pasa (lo marca como subdomain reservado), pero
// buildTenantRepos los rechazaría con 404.
app.use('/api/platform/auth', createPlatformAuthRouter());

// Landing endpoints — públicos, sin tenant scope (marketing host).
app.use('/api/landing', createLandingRouter());

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
app.use('/api/org/domain', createOrgDomainRouter());
app.use('/api/auth', createAuthRouter());
app.use('/api/reports', createReportsRouter());

app.use('/api', notFoundHandler);

// HTML routes: resolveTenant para tener req.organization y poder inyectar
// el branding SSR (paleta + on-primary) antes del primer paint.
const kioskoHtml = serveHtmlWithBranding(path.join(frontendPath, 'kiosko.html'));
const scannerHtml = serveHtmlWithBranding(path.join(frontendPath, 'scanner.html'));
const rsvpHtml = serveHtmlWithBranding(path.join(frontendPath, 'rsvp.html'));
const loginHtml = serveHtmlWithBranding(path.join(frontendPath, 'login.html'));
const indexHtml = serveHtmlWithBranding(path.join(frontendPath, 'index.html'));

// Detecta si el host es el subdomain `admin.<rootDomain>` → es la sección
// de plataforma (platform admin). Distinto del flow de tenant.
function isPlatformHost(req) {
  const host = (req.hostname || '').toLowerCase();
  const root = (config.ROOT_DOMAIN || 'localhost').toLowerCase();
  return host === `admin.${root}` || host === 'admin.localhost';
}

// Detecta si el host es el dominio raíz de marketing (`contan2.com` o
// `www.contan2.com`), o un atajo de dev (`landing.localhost` o query
// `?landing=1`). En esos casos servimos la landing pública, NO el admin SPA.
// Esto cierra el leak descrito en CONSTITUTION §2.2 (admin nunca expuesto
// desde URLs neutras).
function isMarketingHost(req) {
  const host = (req.hostname || '').toLowerCase();
  const root = (config.ROOT_DOMAIN || 'localhost').toLowerCase();
  if (host === root || host === `www.${root}`) return true;
  if (host === 'landing.localhost') return true;
  if (req.query?.landing === '1' && (host === 'localhost' || host === '127.0.0.1')) return true;
  return false;
}

// HTML del platform admin (NO usa serveHtmlWithBranding porque no hay tenant)
import fs from 'fs/promises';
const _platformHtmlCache = new Map();
async function servePlatformHtml(filename) {
  return async (req, res, next) => {
    try {
      let html = _platformHtmlCache.get(filename);
      if (!html) {
        html = await fs.readFile(path.join(frontendPath, filename), 'utf-8');
        _platformHtmlCache.set(filename, html);
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) { next(e); }
  };
}
const platformLoginHandler = await servePlatformHtml('platform-login.html');
const platformDashboardHandler = await servePlatformHtml('platform-dashboard.html');

// Landing: HTML estático sin SSR de branding (no tiene tenant).
// Cache 5min para que cambios de copy se vean razonablemente rápido.
async function landingHandler(req, res, next) {
  try {
    let html = _platformHtmlCache.get('landing.html');
    if (!html) {
      html = await fs.readFile(path.join(frontendPath, 'landing.html'), 'utf-8');
      _platformHtmlCache.set('landing.html', html);
    }
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
}

app.get(/^\/kiosko(?:\/.*)?$/, resolveTenant, kioskoHtml);
app.get(/^\/scanner(?:\/.*)?$/, resolveTenant, scannerHtml);
app.get(/^\/rsvp(?:\/.*)?$/, resolveTenant, rsvpHtml);
// /login, /login/forgot, /login/reset:
// - En admin.<root> → platform-login (super admin)
// - En marketing host → redirect a la landing (no hay tenant para loguearse)
// - En otros hosts (tenants) → login.html (staff login)
app.get(/^\/login(?:\/.*)?$/, (req, res, next) => {
  if (isPlatformHost(req)) return platformLoginHandler(req, res, next);
  if (isMarketingHost(req)) return res.redirect(302, '/#login');
  return resolveTenant(req, res, () => loginHtml(req, res, next));
});

// Paginas publicas compartibles por actividad (Open Graph para WhatsApp/redes).
// Requieren tenant + repos para resolver el slug -> actividad de la org actual.
app.use('/eventos', resolveTenant, buildTenantRepos, createEventosPublicRouter());

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
  // Platform host (admin.<root>): /login → platform-login, todo lo demás → platform-dashboard
  if (isPlatformHost(req)) {
    if (req.path === '/login' || req.path.startsWith('/login/')) {
      return platformLoginHandler(req, res, next);
    }
    return platformDashboardHandler(req, res, next);
  }
  // Marketing host (root contan2.com / www): landing pública. NUNCA admin SPA.
  // Esta es la frontera que cierra el leak histórico de §2.2.
  if (isMarketingHost(req)) {
    return landingHandler(req, res, next);
  }
  if (req.path === '/kiosko' || req.path.startsWith('/kiosko/')) {
    return resolveTenant(req, res, () => kioskoHtml(req, res, next));
  }
  if (req.path === '/scanner' || req.path.startsWith('/scanner/')) {
    return resolveTenant(req, res, () => scannerHtml(req, res, next));
  }
  if (req.path === '/rsvp' || req.path.startsWith('/rsvp/')) {
    return resolveTenant(req, res, () => rsvpHtml(req, res, next));
  }
  if (req.path === '/login' || req.path.startsWith('/login/')) {
    return resolveTenant(req, res, () => loginHtml(req, res, next));
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
