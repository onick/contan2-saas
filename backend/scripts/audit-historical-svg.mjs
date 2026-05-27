// =============================================================================
// audit-historical-svg.mjs · INVENTARIO solo-lectura de SVG en uploads.
// =============================================================================
// Recorre TODOS los archivos del directorio de uploads (no solo `.svg`) y
// detecta SVG por contenido. NO borra. NO modifica.
//
// Por qué inspeccionar por contenido y no solo por extensión:
//   Un SVG malicioso renombrado a `logo.png` se sirve igual con Content-Type
//   `image/png` por nuestro middleware estático, pero el navegador puede
//   re-interpretarlo según el header X-Content-Type-Options. Aunque tenemos
//   `nosniff` activo desde el commit 60dd781, defensa en profundidad exige
//   detectar también renombres maliciosos en el volumen.
//
// Detección de SVG por contenido (en los primeros 4 KiB):
//   - Empieza con `<?xml ...?>` seguido eventualmente por `<svg`
//   - Empieza con `<!DOCTYPE svg`
//   - Empieza con `<svg`
//   - `<svg ` aparece después de whitespace/BOM/comentarios/declaraciones XML
//
// Para cada archivo identificado como SVG (por contenido) reporta:
//   - ruta absoluta
//   - extensión "declarada" (la que tiene en disco) — útil para detectar renombres
//   - tamaño + mtime
//   - flags de riesgo:
//       script_tag      → <script
//       event_handler   → on* (onload, onclick, …)
//       javascript_uri  → 'javascript:' (literal o con entidades)
//       foreign_object  → <foreignObject>
//       expression_css  → expression() o url(javascript:) en style
//       wrong_extension → SVG detectado por contenido cuya extensión NO es .svg
//                         (vector de bypass del header Content-Type estático)
//
// Uso (CLI):
//   node scripts/audit-historical-svg.mjs                       # default backend/data/uploads
//   node scripts/audit-historical-svg.mjs --dir /data/uploads   # producción
//   node scripts/audit-historical-svg.mjs --json                # output JSON parseable
//
// Procedimiento pre-deploy contra producción: ver
// docs/migration-v2/06-svg-quarantine-runbook.md (transferencia SCP del
// script a /tmp + ejecución solo-lectura + cleanup del script temporal).
//
// Exit codes (fail-closed):
//   0  → directorio existe + legible + sin SVG por contenido (clean)
//   10 → SVG detectados, NINGUNO con flags de riesgo (revisar manualmente)
//   20 → al menos un SVG con flags de riesgo (BLOQUEA deploy)
//   1  → cualquier error (dir inexistente / no-directorio / sin permisos / I/O)
//        — NUNCA exit 0 cuando no se pudo verificar.
// =============================================================================

import { readdir, readFile, stat, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, '..', 'data', 'uploads');

// Cuánto leemos para decidir si es SVG. 4 KiB cubre cualquier header XML
// realista (más una posible declaración DOCTYPE larga).
const SNIFF_BYTES = 4096;

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' && argv[i + 1]) { args.dir = path.resolve(argv[++i]); }
    else if (a === '--json') { args.json = true; }
    else if (a === '--help' || a === '-h') {
      console.error('Uso: node scripts/audit-historical-svg.mjs [--dir <path>] [--json]');
      process.exit(0);
    }
  }
  return args;
}

const RISK_PATTERNS = {
  // \b cubre <script>, <script />, <SCRIPT >, <ScRiPt\n…
  script_tag: /<script\b/i,
  event_handler: /\son[a-z]+\s*=/i,
  // 'javascript:' literal o entidad &#x6A;avascript / &#106;avascript
  javascript_uri: /javascript\s*:|&#x?6[Aa];?\s*avascript|&#106;\s*avascript/i,
  foreign_object: /<foreignObject\b/i,
  expression_css: /expression\s*\(|style\s*=\s*["'][^"']*url\s*\(\s*javascript/i,
};

function flagsOf(content) {
  const flags = [];
  for (const [name, re] of Object.entries(RISK_PATTERNS)) {
    if (re.test(content)) flags.push(name);
  }
  return flags;
}

/**
 * Sniffer de SVG por contenido sobre los primeros 4 KiB.
 *
 * Conservador: si el archivo no puede ser abierto/leído lo trataremos
 * como "no-SVG" — pero el caller agrega un `read_error` aparte, así que
 * archivos ilegibles aún se reportan.
 *
 * Devuelve `{ isSvg, head }` para que el caller reuse `head` en flagsOf.
 */
async function sniffSvgHead(filePath) {
  let fd;
  try {
    fd = await open(filePath, 'r');
  } catch {
    return { isSvg: false, head: '', readError: true };
  }
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await fd.read(buf, 0, SNIFF_BYTES, 0);
    // utf8 decode + strip BOM y whitespace inicial.
    const raw = buf.slice(0, bytesRead).toString('utf8');
    const trimmed = raw.replace(/^﻿/, '').trimStart();

    // Caso A: empieza con <?xml ...?> (con o sin attrs) y contiene <svg después.
    if (/^<\?xml\b[\s\S]{0,500}?<svg\b/i.test(trimmed)) return { isSvg: true, head: raw };

    // Caso B: empieza con <!DOCTYPE svg
    if (/^<!DOCTYPE\s+svg\b/i.test(trimmed)) return { isSvg: true, head: raw };

    // Caso C: empieza con <svg (con o sin xmlns).
    if (/^<svg\b/i.test(trimmed)) return { isSvg: true, head: raw };

    // Caso D: dentro del head hay <svg> tras comentarios/XML decl/whitespace.
    // Sólo lo aceptamos si el trimmed empieza con '<' (i.e., no es binario).
    if (trimmed.startsWith('<') && /<svg\b/i.test(trimmed)) return { isSvg: true, head: raw };

    return { isSvg: false, head: raw };
  } finally {
    await fd.close();
  }
}

async function walkAll(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await walkAll(full));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Fail-closed: el directorio raíz debe existir, ser directorio y ser legible.
 * Cualquier desviación → throws con mensaje accionable que el caller
 * convierte en exit 1.
 */
async function assertRootDirReadable(dir) {
  let st;
  try {
    st = await stat(dir);
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`directorio no existe: ${dir} — fail-closed (exit 1), no asumimos "sin SVG"`);
    }
    if (e.code === 'EACCES' || e.code === 'EPERM') {
      throw new Error(`sin permiso de lectura sobre ${dir} — fail-closed (exit 1)`);
    }
    throw new Error(`stat falló sobre ${dir}: ${e.code || ''} ${e.message}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`no es directorio: ${dir} — fail-closed (exit 1)`);
  }
  try {
    await readdir(dir);
  } catch (e) {
    throw new Error(`no se pudo leer ${dir}: ${e.code || ''} ${e.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const dir = args.dir;

  try {
    await assertRootDirReadable(dir);
  } catch (e) {
    console.error(`[audit-svg] ${e.message}`);
    process.exit(1);
  }

  let files;
  try {
    files = await walkAll(dir);
  } catch (e) {
    console.error(`[audit-svg] error leyendo ${dir}: ${e.message}`);
    process.exit(1);
  }

  // Pasada 1: sniff de cabeza para identificar SVG (por contenido, ignorando
  // extensión). Sólo los archivos identificados como SVG entran al reporte.
  // Files binarios (PNG/JPEG/WebP/GIF reales) se omiten silenciosamente.
  const report = [];
  for (const file of files) {
    let st;
    try {
      st = await stat(file);
    } catch (e) {
      // No podemos leer la metadata — fail-closed: reportarlo como riesgo.
      report.push({ file, error: e.message, flags: ['read_error'] });
      continue;
    }

    const { isSvg, head, readError } = await sniffSvgHead(file);
    if (readError) {
      report.push({
        file, size: st.size, mtime: st.mtime.toISOString(),
        flags: ['read_error'],
      });
      continue;
    }
    if (!isSvg) continue; // archivo binario "normal" — no es SVG, no entra al reporte

    // Es SVG por contenido. Leemos el archivo completo para evaluar flags
    // (porque vectores como <foreignObject> pueden estar fuera de los 4 KiB
    // iniciales si el SVG es grande).
    let fullContent = head;
    if (st.size > SNIFF_BYTES) {
      try { fullContent = await readFile(file, 'utf8'); }
      catch (e) {
        report.push({
          file, size: st.size, mtime: st.mtime.toISOString(),
          flags: ['read_error'], error: e.message,
        });
        continue;
      }
    }

    const flags = flagsOf(fullContent);
    // Renombre malicioso: SVG por contenido cuya extensión NO es .svg.
    const ext = path.extname(file).toLowerCase();
    if (ext !== '.svg') flags.push('wrong_extension');

    report.push({
      file, size: st.size, mtime: st.mtime.toISOString(),
      extension: ext || '(none)',
      flags,
    });
  }

  if (args.json) {
    console.log(JSON.stringify({
      dir,
      scannedFiles: files.length,
      svgByContent: report.length,
      withRiskFlags: report.filter(r => (r.flags || []).length > 0).length,
      entries: report,
    }, null, 2));
  } else {
    console.log(`[audit-svg] directorio: ${dir}`);
    console.log(`[audit-svg] archivos escaneados: ${files.length}`);
    console.log(`[audit-svg] SVG (por contenido) encontrados: ${report.length}`);
    if (report.length === 0) {
      console.log('[audit-svg] ✓ sin SVG por contenido — deploy permitido');
    } else {
      const withRisk = report.filter(r => (r.flags || []).length > 0);
      console.log(`[audit-svg] con flags de riesgo: ${withRisk.length}`);
      console.log('');
      for (const r of report) {
        const flag = (r.flags || []).length ? ` [${r.flags.join(',')}]` : '';
        console.log(`  ${r.file}  ext=${r.extension || '?'}  ${r.size}B  ${r.mtime}${flag}`);
      }
      if (withRisk.length > 0) {
        console.log('');
        console.log('[audit-svg] ✗ BLOQUEAR DEPLOY — ver docs/migration-v2/06-svg-quarantine-runbook.md');
      } else {
        console.log('');
        console.log('[audit-svg] ⚠ revisar manualmente — sin flags automáticos pero hay SVG por contenido');
      }
    }
  }

  if (report.length === 0) process.exit(0);
  if (report.some(r => (r.flags || []).length > 0)) process.exit(20);
  process.exit(10);
}

main().catch(e => {
  console.error('[audit-svg] error:', e.message);
  process.exit(1);
});
