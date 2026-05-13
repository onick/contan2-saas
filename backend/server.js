import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './src/config.js';
import { initRepositories, createTenantRepos, CCB_ORG_ID } from './src/db/repositories.js';
import { seedDatabase } from './src/utils/seed.js';
import { startAutoFinalize } from './src/utils/autoFinalize.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';
import { forceCcbTenant, buildTenantRepos } from './src/middleware/tenantRepos.js';
import { createUsersRouter } from './src/routes/users.js';
import { createActivitiesRouter } from './src/routes/activities.js';
import { createAttendanceRouter } from './src/routes/attendance.js';
import { createDashboardRouter } from './src/routes/dashboard.js';
import { createPublicRouter } from './src/routes/public.js';
import { createUploadsRouter, UPLOADS_DIR } from './src/routes/uploads.js';
import { createInsightsRouter } from './src/routes/insights.js';
import { createStaffRouter } from './src/routes/staff.js';
import { createCredentialsRouter } from './src/routes/credentials.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '..', 'frontend');

const app = express();

// Init backend (DB pool + migrations en Postgres; load snapshot en memory)
await initRepositories();

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

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use((req, _res, next) => {
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

// Tenant resolution (Sprint 2: hardcoded a CCB; Sprint 3 lo reemplaza por subdomain lookup)
app.use('/api', forceCcbTenant);
app.use('/api', buildTenantRepos);

// Static (no requiere tenant)
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  immutable: true,
}));

// Routers tenant-aware
app.use('/api/public', createPublicRouter());
app.use('/api/uploads', createUploadsRouter());
app.use('/api/users', createUsersRouter());
app.use('/api/activities', createActivitiesRouter());
app.use('/api/attendance', createAttendanceRouter());
app.use('/api/dashboard', createDashboardRouter());
app.use('/api/insights', createInsightsRouter());
app.use('/api/staff', createStaffRouter());
app.use('/api/credentials', createCredentialsRouter());

app.use('/api', notFoundHandler);

app.get(/^\/kiosko(?:\/.*)?$/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(frontendPath, 'kiosko.html'));
});

app.get(/^\/scanner(?:\/.*)?$/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(frontendPath, 'scanner.html'));
});

app.use(express.static(frontendPath, {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) return next();
  if (req.path === '/kiosko' || req.path.startsWith('/kiosko/')) {
    return res.sendFile(path.join(frontendPath, 'kiosko.html'));
  }
  if (req.path === '/scanner' || req.path.startsWith('/scanner/')) {
    return res.sendFile(path.join(frontendPath, 'scanner.html'));
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
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
