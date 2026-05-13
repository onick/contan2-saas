import pg from 'pg';
import { config } from '../../config.js';
import { runMigrations } from './migrations.js';

let _pool = null;

export function getPool() {
  if (_pool) return _pool;
  const connectionString = config.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no configurada — requerida para DB_DRIVER=postgres');
  }
  _pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _pool.on('error', err => console.error('[postgres] pool error:', err.message));
  return _pool;
}

export async function applySchema() {
  await runMigrations(getPool());
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
