import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

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
  const sql = await fs.readFile(SCHEMA_PATH, 'utf8');
  const pool = getPool();
  await pool.query(sql);
  console.log('[postgres] schema aplicado');
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
