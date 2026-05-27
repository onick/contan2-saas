// =============================================================================
// test/helpers/app.js · setup compartido para suites Vitest + supertest
// =============================================================================
// Inicializa la app contra DB_DRIVER=memory (sin Postgres) y la cachea.
// La mayoría de los tests P0 verifican que endpoints privados NO devuelven
// 200 a anónimos — ese assert no requiere DB real.
//
// Tests RBAC / cross-tenant requieren Postgres real; usar `runIfPostgres()`
// para skip condicional cuando no hay DATABASE_URL.
// =============================================================================

import { afterAll } from 'vitest';

let appPromise;

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
 * Devuelve `it.skip` si no hay Postgres configurado, o el `it` normal si sí.
 * Uso: `runIfPostgres('test description', async () => { ... })`.
 */
export function isPostgresAvailable() {
  return Boolean(process.env.DATABASE_URL && process.env.DB_DRIVER === 'postgres');
}

afterAll(() => {
  // No abrimos sockets en el factory; nada que limpiar.
});
