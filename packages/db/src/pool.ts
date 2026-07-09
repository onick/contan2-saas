// packages/db/src/pool.ts · instancia Kysely v2 sobre pg.Pool.
// Lee DATABASE_URL de process.env directamente (no de @contan2/config, que
// todavía no expone DATABASE_URL — se centralizará en un PR posterior).
// Pool SEPARADO del de v1 (backend/src/db/postgres/pool.js): mismo Postgres,
// distinto pool. Cero estado compartido con v1.

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

// Alias para que los consumidores (api-v2, worker) tipen el cliente sin
// importar `kysely` directamente.
export type DbClient = Kysely<Database>;

let _db: Kysely<Database> | null = null;
let _platformDb: Kysely<Database> | null = null;

export function createDb(connectionString?: string): Kysely<Database> {
  const conn = connectionString ?? process.env.DATABASE_URL;
  if (!conn) {
    throw new Error('DATABASE_URL no configurada — requerida para @contan2/db');
  }
  const dialect = new PostgresDialect({
    pool: new pg.Pool({
      connectionString: conn,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }),
  });
  return new Kysely<Database>({ dialect });
}

/**
 * Pool TENANT (default). Con RLS activo (Fase 3/4) su DATABASE_URL apunta al rol
 * `app_v2` (sujeto a las policies): toda query tenant DEBE ir envuelta en
 * `withTenant(...)`. Es el pool least-privilege y el default de toda la app.
 */
export function getDb(): Kysely<Database> {
  if (!_db) _db = createDb();
  return _db;
}

/**
 * Pool ELEVADO para lecturas/escrituras CROSS-ORG legítimas (super-admin /
 * platform-admin), que NO pueden pasar por RLS porque agregan sobre todos los
 * tenants. Conecta como el rol dueño/bypass vía `PLATFORM_DATABASE_URL`.
 *
 * Fallback deliberado: si `PLATFORM_DATABASE_URL` no está seteada, usa
 * `DATABASE_URL`. Así, MIENTRAS no se vire el rol (pre-Fase 3), ambos pools son
 * la MISMA conexión dueña de hoy → este cambio es INERTE (cero cambio de
 * comportamiento). El split real se activa al setear `PLATFORM_DATABASE_URL` al
 * owner y `DATABASE_URL` a app_v2. Nunca envolver estas queries en withTenant.
 */
export function getPlatformDb(): Kysely<Database> {
  if (!_platformDb) {
    _platformDb = createDb(process.env.PLATFORM_DATABASE_URL ?? process.env.DATABASE_URL);
  }
  return _platformDb;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
  if (_platformDb) {
    await _platformDb.destroy();
    _platformDb = null;
  }
}

/**
 * Conectividad mínima: ejecuta SELECT 1 y devuelve true. Abre un pool
 * efímero y lo destruye (no reusa el singleton) — pensado para el endpoint
 * de health-check interno de api-v2, de uso infrecuente. NO expone versión,
 * host, nombre de DB ni pool stats.
 */
export async function pingDb(connectionString?: string): Promise<boolean> {
  const db = createDb(connectionString);
  try {
    await sql`SELECT 1`.execute(db);
    return true;
  } finally {
    await db.destroy();
  }
}
