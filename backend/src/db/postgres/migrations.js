import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum    TEXT
    )
  `);

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter(f => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  if (files.length === 0) {
    console.log('[migrations] sin archivos');
    return [];
  }

  const { rows: applied } = await pool.query('SELECT id FROM _migrations');
  const appliedSet = new Set(applied.map(r => r.id));
  const ran = [];

  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    if (appliedSet.has(id)) continue;

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = await fs.readFile(filePath, 'utf8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (id) VALUES ($1)', [id]);
      await client.query('COMMIT');
      console.log(`[migrations] ✓ ${id}`);
      ran.push(id);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[migrations] ✗ ${id}: ${e.message}`);
      throw e;
    } finally {
      client.release();
    }
  }

  if (ran.length === 0) {
    console.log(`[migrations] al día (${files.length} aplicadas)`);
  } else {
    console.log(`[migrations] aplicadas ${ran.length} nuevas, total ${files.length}`);
  }
  return ran;
}
