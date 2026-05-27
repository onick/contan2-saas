// =============================================================================
// audit-historical-svg.mjs · INVENTARIO solo-lectura de SVG en uploads.
// =============================================================================
// Recorre TODOS los archivos del directorio de uploads (no solo `.svg`) y
// detecta SVG por contenido sobre el archivo COMPLETO (con cap de seguridad).
// NO borra. NO modifica.
//
// Por qué inspeccionar por contenido y no por una ventana inicial:
//   Un SVG válido puede tener whitespace, comentarios o una declaración
//   `<?xml ?>` arbitrariamente larga antes del `<svg>` raíz. El navegador
//   los acepta. Un atacante puede aprovecharlo para esconder el payload
//   más allá de los primeros 4 KiB y bypassar un sniffer que solo lee el
//   inicio. Por eso ahora leemos hasta `MAX_AUDIT_BYTES` (16 MiB) por
//   archivo y buscamos `<svg\b` en TODO ese contenido.
//
// Política por extensión:
//   - `.svg` → SIEMPRE entra al reporte (es un candidato histórico aunque
//     la estructura no se reconozca; el path estático lo servirá igual).
//     Si no contiene `<svg\b` después de leer el archivo completo, se
//     marca con flag `svg_extension_unverified` para revisión humana —
//     nunca se omite silenciosamente.
//   - cualquier otra extensión → entra al reporte solo si encontramos
//     `<svg\b` en el contenido completo. Se añade flag `wrong_extension`.
//
// Flags de riesgo (búsqueda case-insensitive sobre el archivo completo):
//     script_tag                 → <script\b
//     event_handler              → \son[a-z]+\s*=
//     javascript_uri             → 'javascript:' literal o entidad codificada
//     foreign_object             → <foreignObject\b
//     expression_css             → expression() o url(javascript:) en style
//     wrong_extension            → SVG-por-contenido con extensión != .svg
//     svg_extension_unverified   → archivo .svg sin `<svg\b` detectable
//     truncated_audit            → archivo > MAX_AUDIT_BYTES; se leyó solo
//                                  ese prefijo (revisar manualmente)
//     read_error                 → no se pudo abrir/leer (fail-closed)
//
// Uso (CLI):
//   node scripts/audit-historical-svg.mjs                     # default backend/data/uploads
//   node scripts/audit-historical-svg.mjs --dir /data/uploads # producción
//   node scripts/audit-historical-svg.mjs --json              # output JSON parseable
//
// Procedimiento pre-deploy contra producción: ver
// docs/migration-v2/06-svg-quarantine-runbook.md (transferencia SCP del
// script a /tmp + ejecución solo-lectura + cleanup del script temporal).
//
// Exit codes (fail-closed):
//   0  → directorio existe + legible + 0 entradas en el reporte
//   10 → entradas en el reporte, NINGUNA con flags de riesgo
//   20 → al menos una entrada con flags (BLOQUEA deploy)
//   1  → cualquier error (dir inexistente / no-directorio / sin permisos / I/O)
//        — NUNCA exit 0 cuando no se pudo verificar.
// =============================================================================

import { readdir, stat, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, '..', 'data', 'uploads');

// Cap de seguridad: leemos hasta 16 MiB por archivo. SVGs realistas pesan
// <1 MiB aún con assets embebidos; 16 MiB cubre con margen amplio. Más allá
// marcamos `truncated_audit` y se revisa manualmente — fail-closed.
const MAX_AUDIT_BYTES = 16 * 1024 * 1024;

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
  script_tag: /<script\b/i,
  event_handler: /\son[a-z]+\s*=/i,
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
 * Detecta `<svg` anywhere in `content`. Case-insensitive, word-boundary
 * para que no machee `<svgxyz`. NO depende de la posición — el atacante
 * puede esconder el payload tras kilobytes de whitespace/comentarios/XML
 * prolog y la regex lo encuentra igual.
 */
function containsSvgElement(content) {
  return /<svg\b/i.test(content);
}

/**
 * Lee hasta MAX_AUDIT_BYTES del archivo. Devuelve { content, truncated, size }.
 * Si la lectura falla, devuelve { readError: true } — el caller agrega
 * `read_error` y mantiene fail-closed.
 */
async function readForAudit(filePath) {
  let fd;
  try {
    fd = await open(filePath, 'r');
  } catch (e) {
    return { readError: true, error: e.message };
  }
  try {
    const st = await fd.stat();
    const toRead = Math.min(st.size, MAX_AUDIT_BYTES);
    if (toRead === 0) {
      return { content: '', truncated: false, size: 0 };
    }
    const buf = Buffer.alloc(toRead);
    let totalRead = 0;
    while (totalRead < toRead) {
      const { bytesRead } = await fd.read(buf, totalRead, toRead - totalRead, totalRead);
      if (bytesRead === 0) break;
      totalRead += bytesRead;
    }
    // Decodificamos como utf8 lossy — los bytes no-utf8 se convierten en
    // U+FFFD, lo cual no afecta el match de patrones ASCII (`<svg`, `<script`,
    // `javascript:`).
    return {
      content: buf.slice(0, totalRead).toString('utf8'),
      truncated: st.size > MAX_AUDIT_BYTES,
      size: st.size,
    };
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

  const report = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const isSvgExt = ext === '.svg';

    let st;
    try {
      st = await stat(file);
    } catch (e) {
      report.push({ file, extension: ext || '(none)', error: e.message, flags: ['read_error'] });
      continue;
    }

    const read = await readForAudit(file);
    if (read.readError) {
      report.push({
        file, extension: ext || '(none)',
        size: st.size, mtime: st.mtime.toISOString(),
        flags: ['read_error'], error: read.error,
      });
      continue;
    }

    const hasSvgElement = containsSvgElement(read.content);
    const riskFlags = flagsOf(read.content);

    // Política de inclusión:
    //  - extensión .svg → SIEMPRE entra al reporte
    //  - cualquier otra extensión → solo si hay <svg\b en el contenido
    if (!isSvgExt && !hasSvgElement) continue;

    const flags = [...riskFlags];
    if (isSvgExt && !hasSvgElement) flags.push('svg_extension_unverified');
    if (!isSvgExt) flags.push('wrong_extension');
    if (read.truncated) flags.push('truncated_audit');

    report.push({
      file,
      extension: ext || '(none)',
      size: st.size,
      mtime: st.mtime.toISOString(),
      flags,
    });
  }

  if (args.json) {
    console.log(JSON.stringify({
      dir,
      scannedFiles: files.length,
      svgCandidates: report.length,
      withRiskFlags: report.filter(r => (r.flags || []).length > 0).length,
      entries: report,
    }, null, 2));
  } else {
    console.log(`[audit-svg] directorio: ${dir}`);
    console.log(`[audit-svg] archivos escaneados: ${files.length}`);
    console.log(`[audit-svg] candidatos SVG: ${report.length}`);
    if (report.length === 0) {
      console.log('[audit-svg] ✓ sin candidatos SVG — deploy permitido');
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
        console.log('[audit-svg] ⚠ revisar manualmente — candidatos SVG sin flags automáticos');
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
