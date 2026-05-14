#!/usr/bin/env node
// Optimiza in-place las imágenes existentes en data/uploads/.
// - GIFs se dejan intactos.
// - JPG/PNG/WebP -> JPEG progresivo q82, max 1080px.
// - Actualiza la columna image_url en la DB para reflejar el rename a .jpg.
//
// Uso (dentro del contenedor):  node backend/scripts/optimize-uploads.js
// Uso local:                     DB_URL=... node backend/scripts/optimize-uploads.js

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');

const SKIP_EXT = new Set(['.gif']);
const PROCESS_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function main() {
  const files = await fs.readdir(UPLOADS_DIR).catch(() => []);
  if (!files.length) {
    console.log('No hay archivos en', UPLOADS_DIR);
    return;
  }

  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.DB_URL });

  let optimized = 0;
  let skipped = 0;
  let saved = 0;

  for (const name of files) {
    const ext = path.extname(name).toLowerCase();
    if (SKIP_EXT.has(ext)) { skipped++; continue; }
    if (!PROCESS_EXT.has(ext)) { skipped++; continue; }

    const inPath = path.join(UPLOADS_DIR, name);
    const base = path.basename(name, ext);
    const outFilename = `${base}.jpg`;
    const outPath = path.join(UPLOADS_DIR, outFilename);

    const before = (await fs.stat(inPath)).size;
    const tmpPath = outPath + '.tmp';

    try {
      await sharp(inPath)
        .rotate()
        .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, progressive: true, mozjpeg: true })
        .toFile(tmpPath);
    } catch (e) {
      console.warn(`[skip] ${name}: ${e.message}`);
      await fs.unlink(tmpPath).catch(() => {});
      skipped++;
      continue;
    }

    const after = (await fs.stat(tmpPath)).size;
    // Si NO redujo nada significativo, conservar el original (excepto si cambia extensión).
    if (after >= before && ext === '.jpg') {
      await fs.unlink(tmpPath);
      console.log(`[keep] ${name}  ${(before/1024).toFixed(0)}KB (no mejoró)`);
      skipped++;
      continue;
    }

    await fs.rename(tmpPath, outPath);
    if (outPath !== inPath) await fs.unlink(inPath).catch(() => {});

    // Update DB si el filename cambió.
    if (outFilename !== name) {
      const oldUrl = `/uploads/${name}`;
      const newUrl = `/uploads/${outFilename}`;
      const r = await pool.query(
        'UPDATE activities SET image_url = $1 WHERE image_url = $2',
        [newUrl, oldUrl],
      );
      if (r.rowCount > 0) console.log(`  DB: ${r.rowCount} fila(s) actualizada(s)`);
    }

    console.log(`[opt]  ${name}  ${(before/1024).toFixed(0)}KB -> ${(after/1024).toFixed(0)}KB (${Math.round((1-after/before)*100)}% menos)`);
    optimized++;
    saved += (before - after);
  }

  console.log('---');
  console.log(`Optimizadas: ${optimized}   Saltadas: ${skipped}   Total ahorrado: ${(saved/1024).toFixed(0)}KB`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
