#!/usr/bin/env node
// =============================================================================
// Migra el snapshot JSON (backend/data/db.json) a una DB Postgres existente.
//
// Uso:
//   DATABASE_URL=postgres://user:pass@host:port/db \
//     node scripts/migrate-json-to-postgres.js [--reset]
//
// Flags:
//   --reset    Borra todas las tablas antes de insertar (TRUNCATE).
//   --dry-run  Solo reporta lo que insertaría, no toca la DB.
// =============================================================================

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../src/config.js';
import { getPool, applySchema, closePool } from '../src/db/postgres/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

const RESET = process.argv.includes('--reset');
const DRY = process.argv.includes('--dry-run');

async function main() {
  if (!config.DATABASE_URL) {
    console.error('✗ Falta DATABASE_URL en env');
    process.exit(1);
  }

  console.log(`[migrate] leyendo ${DB_FILE}`);
  const raw = await fs.readFile(DB_FILE, 'utf8');
  const snapshot = JSON.parse(raw);
  const { users = [], activities = [], attendance = [] } = snapshot;

  console.log(`[migrate] snapshot: ${users.length} usuarios · ${activities.length} actividades · ${attendance.length} asistencias`);

  if (DRY) {
    console.log('[migrate] --dry-run: nada se inserta');
    return;
  }

  await applySchema();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (RESET) {
      console.log('[migrate] --reset: TRUNCATE de attendance, activities, users');
      await client.query('TRUNCATE attendance, activities, users RESTART IDENTITY CASCADE');
    }

    // Activities primero (sin FK)
    let okAct = 0;
    for (const a of activities) {
      try {
        await client.query(
          `INSERT INTO activities
            (id, name, type, location, date, capacity, description, image_url, enrolled_count, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             type = EXCLUDED.type,
             location = EXCLUDED.location,
             date = EXCLUDED.date,
             capacity = EXCLUDED.capacity,
             description = EXCLUDED.description,
             image_url = EXCLUDED.image_url,
             enrolled_count = EXCLUDED.enrolled_count,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at`,
          [
            a.id, a.name, a.type, a.location, a.date, a.capacity,
            a.description ?? '', a.imageUrl ?? null,
            a.enrolledCount ?? 0, a.status ?? 'activa',
            a.createdAt, a.updatedAt,
          ],
        );
        okAct += 1;
      } catch (e) {
        console.error(`  ✗ actividad ${a.id} (${a.name}): ${e.message}`);
      }
    }
    console.log(`  ✓ ${okAct}/${activities.length} actividades`);

    // Users
    let okUsr = 0;
    for (const u of users) {
      try {
        await client.query(
          `INSERT INTO users
            (id, code, first_name, last_name, email, phone, visit_count, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             code = EXCLUDED.code,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             visit_count = EXCLUDED.visit_count,
             updated_at = EXCLUDED.updated_at`,
          [
            u.id, u.code, u.firstName, u.lastName,
            u.email ?? null, u.phone ?? null,
            u.visitCount ?? 1,
            u.createdAt, u.updatedAt,
          ],
        );
        okUsr += 1;
      } catch (e) {
        console.error(`  ✗ usuario ${u.code} (${u.email || u.firstName}): ${e.message}`);
      }
    }
    console.log(`  ✓ ${okUsr}/${users.length} usuarios`);

    // Attendance
    let okAtt = 0;
    for (const a of attendance) {
      try {
        await client.query(
          `INSERT INTO attendance
            (id, user_id, user_code, activity_id, activity_name, registered_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [a.id, a.userId, a.userCode, a.activityId, a.activityName, a.registeredAt],
        );
        okAtt += 1;
      } catch (e) {
        console.error(`  ✗ asistencia ${a.id}: ${e.message}`);
      }
    }
    console.log(`  ✓ ${okAtt}/${attendance.length} asistencias`);

    await client.query('COMMIT');
    console.log('[migrate] commit ok');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[migrate] rollback:', e.message);
    throw e;
  } finally {
    client.release();
  }

  await closePool();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
