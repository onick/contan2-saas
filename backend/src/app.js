// =============================================================================
// app.js · factory de la aplicación Express
// =============================================================================
// Extraído de server.js (FASE 1.A · security/p0-hardening) para habilitar tests
// con supertest sin abrir un puerto ni arrancar timers (autoFinalize, etc.).
//
// Diseño:
//   - createApp() devuelve la app configurada (express() + middleware + routes).
//   - NO llama listen(), NO inicializa pools de DB, NO ejecuta seed/bootstrap.
//   - El caller (server.js para prod, harness de tests para Vitest) decide
//     cuándo inicializar dependencias antes de construir la app.
//
// Para tests:
//   process.env.DB_DRIVER = 'memory';
//   process.env.ROOT_DOMAIN = 'localhost';
//   await initRepositories();
//   const app = await createApp();
//   request(app).get('/api/users');
// =============================================================================

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { buildTenantRepos } from './middleware/tenantRepos.js';
import { resolveTenant } from './middleware/resolveTenant.js';
import { serveHtmlWithBranding } from './middleware/serveHtmlWithBranding.js';
import { createTenantRouter } from './routes/tenant.js';
import { createUsersRouter } from './routes/users.js';
import { createActivitiesRouter } from './routes/activities.js';
import { createAttendanceRouter } from './routes/attendance.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createPublicRouter } from './routes/public.js';
import { createUploadsRouter, UPLOADS_DIR } from './routes/uploads.js';
import { createInsightsRouter } from './routes/insights.js';
import { createStaffRouter } from './routes/staff.js';
import { createCredentialsRouter } from './routes/credentials.js';
import { createOrgBrandingRouter } from './routes/orgBranding.js';
import { createOrgDomainRouter } from './routes/orgDomain.js';
import { createAuthRouter } from './routes/auth.js';
import { createPlatformAuthRouter } from './routes/platformAuth.js';
import { createPlatformAdminRouter } from './routes/platformAdmin.js';
import { createReportsRouter } from './routes/reports.js';
import { createEventosPublicRouter } from './routes/eventosPublic.js';
import { createLandingRouter } from './routes/landing.js';
import { createStaffManagementRouter } from './routes/staffManagement.js';
import { createAuditLogRouter } from './routes/auditLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '..', '..', 'frontend');

/**
 * @param {object} [opts]
 * @param {boolean} [opts.quietLogs=false] — silencia el middleware logger en tests.
 * @returns {Promise<import('express').Express>}
 */
export async function createApp(opts = {}) {
  const { quietLogs = false } = opts;
  const app = express();
  app.disable('x-powered-by');

  // CORS: en dev (ROOT_DOMAIN=localhost) aceptamos cualquier origen para
  // ergonomía de tooling. En producción, solo el ROOT_DOMAIN y sus subdomains.
  const corsOriginCheck = (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin
    if (config.ROOT_DOMAIN === 'localhost') return cb(null, true);
    try {
      const u = new URL(origin);
      const host = u.hostname;
      const root = config.ROOT_DOMAIN.toLowerCase();
      if (host === root || host.endsWith('.' + root)) return cb(null, true);
    } catch { /* origin inválida → return false abajo */ }
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

  if (!quietLogs) {
    app.use((req, _res, next) => {
      if (req.path === '/healthz') return next();
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  // Persistencia debounced (solo aplica a memory driver)
  app.use((req, res, next) => {
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (!isMutation || !req.path.startsWith('/api')) return next();
    res.on('finish', () => {
      if (res.statusCode < 400 && req.repos?.persist) req.repos.persist();
    });
    next();
  });

  // Static uploads (no requieren tenant en URL). `nosniff` evita que el
  // navegador interprete bytes como un MIME distinto al declarado por el
  // server (ej. si por error sirviéramos un SVG con content-type image/png
  // — defensa en profundidad contra MIME confusion).
  app.use('/uploads', express.static(UPLOADS_DIR, {
    maxAge: '7d',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }));

  // Platform admin endpoints — DEBEN ir antes del buildTenantRepos porque
  // el platform admin NO pertenece a ningún tenant (req.organizationId = null).
  app.use('/api/platform/auth', createPlatformAuthRouter());
  app.use('/api/platform', createPlatformAdminRouter());

  // Landing endpoints — públicos, sin tenant scope.
  app.use('/api/landing', createLandingRouter());

  // Tenant resolution + repos (basado en subdomain o custom domain)
  app.use('/api', resolveTenant);
  app.use('/api', buildTenantRepos);

  // Endpoint público de branding consumido por el frontend antes del login.
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
  // Gestión de staff (Sprint 3): /members, /invitations. NO choca con
  // /login, /logout, /me del router legacy de arriba.
  app.use('/api/staff', createStaffManagementRouter());
  app.use('/api/audit-log', createAuditLogRouter());
  app.use('/api/credentials', createCredentialsRouter());
  app.use('/api/org/branding', createOrgBrandingRouter());
  app.use('/api/org/domain', createOrgDomainRouter());
  app.use('/api/auth', createAuthRouter());
  app.use('/api/reports', createReportsRouter());

  app.use('/api', notFoundHandler);

  // HTML routes con SSR de branding por tenant.
  const kioskoHtml = serveHtmlWithBranding(path.join(frontendPath, 'kiosko.html'));
  const scannerHtml = serveHtmlWithBranding(path.join(frontendPath, 'scanner.html'));
  const rsvpHtml = serveHtmlWithBranding(path.join(frontendPath, 'rsvp.html'));
  const loginHtml = serveHtmlWithBranding(path.join(frontendPath, 'login.html'));
  const indexHtml = serveHtmlWithBranding(path.join(frontendPath, 'index.html'));
  const inviteHtml = serveHtmlWithBranding(path.join(frontendPath, 'invite.html'));

  function isPlatformHost(req) {
    const host = (req.hostname || '').toLowerCase();
    const root = (config.ROOT_DOMAIN || 'localhost').toLowerCase();
    return host === `admin.${root}` || host === 'admin.localhost';
  }

  function isMarketingHost(req) {
    const host = (req.hostname || '').toLowerCase();
    const root = (config.ROOT_DOMAIN || 'localhost').toLowerCase();
    if (host === root || host === `www.${root}`) return true;
    if (host === 'landing.localhost') return true;
    if (req.query?.landing === '1' && (host === 'localhost' || host === '127.0.0.1')) return true;
    return false;
  }

  // HTML del platform admin (NO usa serveHtmlWithBranding porque no hay tenant)
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
  app.get(/^\/invite(?:\/.*)?$/, resolveTenant, inviteHtml);
  app.get(/^\/login(?:\/.*)?$/, (req, res, next) => {
    if (isPlatformHost(req)) return platformLoginHandler(req, res, next);
    if (isMarketingHost(req)) return res.redirect(302, '/#login');
    return resolveTenant(req, res, () => loginHtml(req, res, next));
  });

  app.use('/eventos', resolveTenant, buildTenantRepos, createEventosPublicRouter());

  app.use(express.static(frontendPath, {
    setHeaders: (res, filePath) => {
      if (/\.(html|js|css)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
    index: false,
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    if (isPlatformHost(req)) {
      if (req.path === '/login' || req.path.startsWith('/login/')) {
        return platformLoginHandler(req, res, next);
      }
      return platformDashboardHandler(req, res, next);
    }
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
    if (req.path === '/invite' || req.path.startsWith('/invite/')) {
      return resolveTenant(req, res, () => inviteHtml(req, res, next));
    }
    if (req.path === '/login' || req.path.startsWith('/login/')) {
      return resolveTenant(req, res, () => loginHtml(req, res, next));
    }
    return resolveTenant(req, res, () => indexHtml(req, res, next));
  });

  app.use(errorHandler);

  return app;
}
