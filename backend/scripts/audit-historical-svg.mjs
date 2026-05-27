// =============================================================================
// audit-historical-svg.mjs · INVENTARIO solo-lectura de SVG en uploads.
// =============================================================================
// Lista los .svg que viven en el directorio de uploads (`backend/data/uploads`
// o el que se pase con --dir). NO borra nada. NO modifica nada.
//
// Para cada SVG reporta:
//   - ruta absoluta
//   - tamaño en bytes
//   - mtime
//   - flags heurísticos de riesgo:
//       script_tag      → contiene <script
//       event_handler   → contiene atributo on* (onload, onclick, …)
//       javascript_uri  → contiene 'javascript:' (con o sin entidades)
//       foreign_object  → contiene <foreignObject> (vector típico de XSS SVG)
//       expression_css  → contiene 'expression(' o url(javascript: en style
//
// Uso:
//   node scripts/audit-historical-svg.mjs                       # default backend/data/uploads
//   node scripts/audit-historical-svg.mjs --dir /path/to/uploads
//   node scripts/audit-historical-svg.mjs --json                # output JSON puro
//
// Procedimiento pre-deploy obligatorio (ver docs/migration-v2/06-svg-quarantine-runbook.md):
//   1. Ejecutar este script contra el volumen de uploads del ambiente target
//      (prod via `ssh ... 'node scripts/audit-historical-svg.mjs --json'`
//      sin acceso destructivo).
//   2. Si retorna 0 archivos → continuar deploy normal.
//   3. Si retorna archivos con flags de riesgo → cuarentena manual antes de
//      seguir (mover a un directorio fuera del path estático servido por
//      Express + convertir a PNG con un sanitizer o eliminar).
//
// Exit codes (fail-closed):
//   0  → directorio existe, es legible, sin SVG encontrados (clean)
//   10 → SVG encontrados pero NINGUNO con flags de riesgo (revisar)
//   20 → SVG con al menos un flag de riesgo (BLOQUEAR deploy hasta tratar)
//   1  → cualquier error (directorio inexistente, no-directorio, sin permisos,
//        argumento inválido, I/O failure). NUNCA se devuelve 0 cuando no se
//        pudo verificar — un "no encontré nada" sin acceso al volumen es
//        indistinguible de "no hay riesgo", así que falla cerrado.
// =============================================================================

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, '..', 'data', 'uploads');

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
  // \b en vez de [\s>] cubre también <script/>, <SCRIPT >, <ScRiPt\n…
  script_tag: /<script\b/i,
  event_handler: /\son[a-z]+\s*=/i,
  javascript_uri: /javascript\s*:|&#x?6[Aa];?\s*avascript/i,
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

async function walk(dir) {
  // Solo el caller raíz hace la verificación de existencia con fail-closed;
  // subdirectorios pueden no existir si fueron borrados durante el walk,
  // pero el caso normal es que todo el subárbol exista.
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...await walk(full));
    } else if (e.isFile() && /\.svg$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Fail-closed: el directorio raíz debe existir, ser directorio y ser legible.
 * Cualquier desviación → throws con un mensaje accionable que el caller
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
  // Verifica que efectivamente podemos leerlo (no solo statearlo).
  try {
    await readdir(dir);
  } catch (e) {
    throw new Error(`no se pudo leer ${dir}: ${e.code || ''} ${e.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const dir = args.dir;

  // Fail-closed: verificamos el directorio raíz ANTES de declarar "clean".
  try {
    await assertRootDirReadable(dir);
  } catch (e) {
    console.error(`[audit-svg] ${e.message}`);
    process.exit(1);
  }

  let files;
  try {
    files = await walk(dir);
  } catch (e) {
    console.error(`[audit-svg] error leyendo ${dir}: ${e.message}`);
    process.exit(1);
  }

  const report = [];
  let anyRisk = false;
  for (const file of files) {
    let content = '';
    let size = 0;
    let mtime = null;
    try {
      const st = await stat(file);
      size = st.size;
      mtime = st.mtime.toISOString();
      content = await readFile(file, 'utf8');
    } catch (e) {
      report.push({ file, error: e.message, flags: ['read_error'] });
      anyRisk = true;
      continue;
    }
    const flags = flagsOf(content);
    if (flags.length > 0) anyRisk = true;
    report.push({ file, size, mtime, flags });
  }

  if (args.json) {
    console.log(JSON.stringify({
      dir,
      total: report.length,
      withRiskFlags: report.filter(r => (r.flags || []).length > 0).length,
      entries: report,
    }, null, 2));
  } else {
    console.log(`[audit-svg] directorio: ${dir}`);
    console.log(`[audit-svg] SVG encontrados: ${report.length}`);
    if (report.length === 0) {
      console.log('[audit-svg] ✓ sin SVG en el volumen — deploy permitido');
    } else {
      const withRisk = report.filter(r => (r.flags || []).length > 0);
      console.log(`[audit-svg] con flags de riesgo: ${withRisk.length}`);
      console.log('');
      for (const r of report) {
        const flag = (r.flags || []).length ? ` [${r.flags.join(',')}]` : '';
        console.log(`  ${r.file}  ${r.size}B  ${r.mtime}${flag}`);
      }
      if (withRisk.length > 0) {
        console.log('');
        console.log('[audit-svg] ✗ BLOQUEAR DEPLOY — ver docs/migration-v2/06-svg-quarantine-runbook.md');
      } else {
        console.log('');
        console.log('[audit-svg] ⚠ revisar manualmente — sin flags automáticos pero hay SVG presentes');
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
