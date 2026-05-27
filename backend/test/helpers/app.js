// =============================================================================
// test/helpers/app.js · setup compartido para suites Vitest + supertest
// =============================================================================
// Inicializa la app contra DB_DRIVER=memory (sin Postgres) y la cachea.
// La mayoría de los tests P0 verifican que endpoints privados NO devuelven
// 200 a anónimos — ese assert no requiere DB real.
//
// Tests RBAC / cross-tenant requieren Postgres real; usar `runIfPostgres()`
// para skip condicional cuando no hay DATABASE_URL.
//
// Higiene: los tests NUNCA escriben al volumen real `backend/data/uploads`.
// Se setea `UPLOADS_DIR=<tmp>` antes de cargar la app; el módulo
// `routes/uploads.js` lo respeta. El directorio se borra recursivamente
// al final de la suite.
// =============================================================================

import { it, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let appPromise;
let testUploadsDir = null;

export function getTestUploadsDir() {
  if (!testUploadsDir) {
    // Crear el directorio temporal lo antes posible (módulo top-level)
    // para que el import de routes/uploads.js (que hace `await fs.mkdir`
    // sobre UPLOADS_DIR) lo encuentre listo.
    testUploadsDir = mkdtempSync(path.join(tmpdir(), 'contan2-test-uploads-'));
  }
  return testUploadsDir;
}

// Inicializamos inmediatamente: routes/uploads.js hace `await fs.mkdir`
// en top-level import, así que UPLOADS_DIR debe estar seteado antes de
// que cualquier test importe la app.
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR || getTestUploadsDir();

export async function getTestApp() {
  if (appPromise) return appPromise;
  process.env.DB_DRIVER = process.env.DB_DRIVER || 'memory';
  process.env.ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'localhost';
  process.env.PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3457';
  appPromise = (async () => {
    const { initRepositories } = await import('../../src/db/repositories.js');
    await initRepositories();
    const { createApp } = await import('../../src/app.js');
    return await createApp({ quietLogs: true });
  })();
  return appPromise;
}

/**
 * Devuelve `true` si hay DATABASE_URL + DB_DRIVER=postgres configurados.
 * Uso típico: `(isPostgresAvailable() ? it : it.skip)('...', async () => {})`
 * o el helper `runIfPostgres` directamente.
 */
export function isPostgresAvailable() {
  return Boolean(process.env.DATABASE_URL && process.env.DB_DRIVER === 'postgres');
}

/**
 * Wrapper de `it` que se skipea automáticamente si no hay Postgres.
 *
 * Las suites de RBAC positivo (operator → 403, owner → 200, cross-tenant → 404)
 * requieren sesiones reales en la tabla `staff_sessions` y staff_members con
 * password hash + role. El memory driver no expone esa superficie.
 *
 * Uso: `runIfPostgres('operator no puede DELETE actividad', async () => { ... })`.
 */
export function runIfPostgres(name, fn, timeout) {
  if (isPostgresAvailable()) {
    return it(name, fn, timeout);
  }
  return it.skip(`[skip · no Postgres] ${name}`, fn);
}

afterAll(() => {
  // Limpiar el directorio temporal de uploads. Usamos rmSync (síncrono)
  // porque afterAll global puede ejecutar antes de que async settle si
  // no awaiteamos — esto garantiza limpieza.
  if (testUploadsDir) {
    rmSync(testUploadsDir, { recursive: true, force: true });
    testUploadsDir = null;
  }
});
