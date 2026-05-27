// =============================================================================
// server.js · entrypoint productivo
// =============================================================================
// Construye y arranca la app real. Para tests, usar `createApp()` directamente
// desde `src/app.js` (ver docs/migration-v2/03-security-hardening-plan.md).
// =============================================================================

import { config, validateConfig } from './src/config.js';
import { initRepositories, createTenantRepos, CCB_ORG_ID } from './src/db/repositories.js';
import { runBootstrap } from './src/bootstrap.js';
import { seedDatabase } from './src/utils/seed.js';
import { startAutoFinalize } from './src/utils/autoFinalize.js';
import { createApp } from './src/app.js';

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

const app = await createApp();

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
