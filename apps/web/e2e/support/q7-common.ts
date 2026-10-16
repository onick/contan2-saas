// support/q7-common.ts · utilidades de la ola Q7 (transversales). SOLO LECTURA.
// Rutas, deteccion de copy (demo / voseo / placeholders), consola, axe con ratchet y registro de hallazgos.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ARTIFACTS_DIR, E2E_DIR } from '../env';

// ── Rutas ──────────────────────────────────────────────────────────────────
export const PUBLIC_ROUTES = ['/login', '/recuperar', '/kiosko'] as const;

/** Rutas autenticadas (owner). Detalle de actividad es un drawer (no hay ruta /actividades/<id>). */
export const OWNER_ROUTES = [
  '/app',
  '/app/actividades',
  '/app/check-in',
  '/app/usuarios',
  '/app/registros',
  '/app/segmentos',
  '/app/reportes',
  '/app/historial',
  '/app/equipo',
  '/app/identidad',
  '/app/modo-publico',
  '/app/cuenta',
  '/app/protocolo',
  '/app/puerta',
  '/app/biblioteca',
  '/app/biblioteca/catalogo',
  '/app/biblioteca/lectores',
  '/app/biblioteca/circulacion',
  '/app/biblioteca/reservas',
  '/app/biblioteca/inventario',
  '/app/biblioteca/titulos/nuevo',
] as const;

export const ROLE_HOMES = [
  { role: 'puerta', home: '/app/puerta' },
  { role: 'protocolo', home: '/app/protocolo' },
  { role: 'biblioteca', home: '/app/biblioteca' },
  { role: 'consulta', home: '/app' },
  { role: 'operator', home: '/app' },
  { role: 'admin', home: '/app' },
] as const;

export const slug = (s: string): string => s.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-') || 'root';

// ── Registro de hallazgos (jsonl en .artifacts/q7, no se commitea) ─────────
const Q7_DIR = path.join(ARTIFACTS_DIR, 'q7');
export function q7Dir(): string {
  mkdirSync(Q7_DIR, { recursive: true });
  return Q7_DIR;
}
export function record(kind: string, data: Record<string, unknown>): void {
  try {
    appendFileSync(path.join(q7Dir(), `${kind}.jsonl`), JSON.stringify({ t: Date.now(), ...data }) + '\n');
  } catch {
    /* el registro nunca debe romper un test */
  }
}

// ── Espera de carga estable ────────────────────────────────────────────────
export async function gotoSettled(page: Page, url: string) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(350);
  return res;
}

// ── Demo ───────────────────────────────────────────────────────────────────
export const DEMO_RE = /datos de demostraci[oó]n|datos demo\b|modo demo\b|fallback activado|\(demo\)|\[demo\]|solo lectura \(datos de demo/i;

// ── Copy: voseo, placeholders ──────────────────────────────────────────────
const VOSEO_WORDS = [
  // imperativos con tilde final (voseo rioplatense)
  'hacé', 'agregá', 'elegí', 'ingresá', 'escribí', 'seleccioná', 'buscá', 'probá', 'revisá', 'completá',
  'confirmá', 'tocá', 'presioná', 'descargá', 'creá', 'usá', 'vení', 'decí', 'mirá', 'fijate', 'esperá',
  'intentá', 'verificá', 'guardá', 'cargá', 'subí', 'editá', 'borrá', 'eliminá', 'enviá', 'cliqueá',
  'apretá', 'pegá', 'copiá', 'mové', 'arrastrá', 'cambiá', 'activá', 'desactivá', 'reintentá', 'volvé',
  'cerrá', 'abrí', 'escaneá', 'registrá', 'indicá', 'contactá', 'consultá', 'llená', 'rellená', 'seguí',
  'recordá', 'tené', 'sabé', 'asegurate', 'quedate', 'conectate', 'vinculá', 'ponete', 'dejá', 'pasá',
  'compartí', 'importá', 'exportá', 'filtrá', 'ordená', 'limpiá', 'actualizá', 'generá', 'sumá', 'quitá',
  'añadí', 'cargalo', 'probalo', 'revisalo', 'agregalo', 'elegilo',
  // presentes en -ás/-és/-ís
  'podés', 'tenés', 'querés', 'sabés', 'hacés', 'sos', 'vos', 'necesitás', 'preferís', 'ves', 'venís',
  'estás', 'ingresás', 'elegís', 'buscás', 'escribís', 'usás', 'creás', 'querés',
];
// ('ves', 'estás' son validos en tuteo; se quitan abajo para no dar falsos positivos.)
const TUTEO_OK = new Set(['ves', 'estás', 'sos']);
export const VOSEO_RE = new RegExp(
  `(?<![\\p{L}])(?:${VOSEO_WORDS.filter((w) => !TUTEO_OK.has(w)).join('|')})(?![\\p{L}])`,
  'giu',
);
export const BAD_PLACEHOLDER_RE = /[Ll]orem|[Ii]psum|\bundefined\b|\bNaN\b|\[object |\bnull\b|\bTODO\b|\bFIXME\b|\{\{|\}\}|Invalid Date|%s\b/;

export interface PageCopy {
  text: string;
  attrs: string[];
}

/** Texto visible + atributos accesibles (placeholder / aria-label / title / alt). */
export async function pageCopy(page: Page): Promise<PageCopy> {
  return page.evaluate(() => {
    const attrs: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[placeholder],[aria-label],[title],img[alt]'))) {
      for (const a of ['placeholder', 'aria-label', 'title', 'alt']) {
        const v = el.getAttribute(a);
        if (v && v.trim()) attrs.push(v.trim());
      }
    }
    return { text: document.body?.innerText ?? '', attrs };
  });
}

/** Fragmentos de contexto (≤80 chars) alrededor de cada coincidencia. */
export function matches(re: RegExp, copy: PageCopy): string[] {
  const out = new Set<string>();
  for (const src of [copy.text, ...copy.attrs]) {
    for (const m of src.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
      const i = m.index ?? 0;
      out.add(src.slice(Math.max(0, i - 25), i + m[0].length + 35).replace(/\s+/g, ' ').trim());
    }
  }
  return [...out];
}

// ── Consola ────────────────────────────────────────────────────────────────
export interface ConsoleWatch {
  errors: string[];
  warnings: string[];
  /** 404 de recursos (imagenes /uploads, etc.) -- se reportan aparte. */
  resource404: string[];
  failedRequests: string[];
}
const NOISE_RE = /chrome-extension|moz-extension|extension:\/\/|ResizeObserver loop|favicon|Download the React DevTools|googletagmanager|google-analytics|fonts\.g(static|oogleapis)/i;

export function watchConsole(page: Page): ConsoleWatch {
  const w: ConsoleWatch = { errors: [], warnings: [], resource404: [], failedRequests: [] };
  page.on('pageerror', (e) => w.errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on('console', (m) => {
    const t = m.text().slice(0, 300);
    if (NOISE_RE.test(t) || NOISE_RE.test(m.location().url ?? '')) return;
    if (m.type() === 'error') {
      // "Failed to load resource: ... 404" no trae la URL en el texto: la aporta el listener 'response'.
      if (/Failed to load resource/i.test(t)) return;
      w.errors.push(`console.error: ${t}`);
    } else if (m.type() === 'warning') w.warnings.push(`console.warn: ${t}`);
  });
  page.on('response', (r) => {
    const s = r.status();
    if (s < 400) return;
    const u = new URL(r.url());
    const label = `${s} ${r.request().method()} ${u.pathname.replace(/\/\d{6,}[^/]*/g, '/<id>').slice(0, 90)}`;
    if (r.request().resourceType() === 'image' || /^\/uploads\//.test(u.pathname)) w.resource404.push(label);
    else if (!NOISE_RE.test(r.url())) w.failedRequests.push(label);
  });
  return w;
}

// ── axe con ratchet ────────────────────────────────────────────────────────
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export const BASELINE_FILE = path.join(E2E_DIR, 'a11y-baseline.json');
export function readBaseline(): Record<string, string[]> {
  if (!existsSync(BASELINE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Record<string, string[]>;
  } catch {
    return {};
  }
}
function writeBaseline(b: Record<string, string[]>): void {
  const sorted = Object.fromEntries(Object.keys(b).sort().map((k) => [k, [...new Set(b[k])].sort()]));
  writeFileSync(BASELINE_FILE, JSON.stringify(sorted, null, 2) + '\n');
}

export interface AxeSummary {
  critical: string[];
  serious: string[];
  moderate: string[];
  minor: string[];
}

/**
 * axe + ratchet. Modo normal: falla con critical/serious que NO esten en a11y-baseline.json.
 * Q7_A11Y_RECORD=1 (con --workers=1): fusiona lo observado en la baseline y no falla.
 */
export async function q7Axe(
  page: Page,
  testInfo: TestInfo,
  name: string,
  opts: { include?: string[]; exclude?: string[] } = {},
): Promise<AxeSummary> {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // evita falsos contrastes a mitad de animacion
  await page.waitForTimeout(250);
  let b = new AxeBuilder({ page }).withTags(TAGS);
  for (const s of opts.include ?? []) b = b.include(s);
  for (const s of opts.exclude ?? []) b = b.exclude(s);
  const { violations } = await b.analyze();

  const by = (imp: string) => violations.filter((v) => v.impact === imp).map((v) => v.id);
  const sum: AxeSummary = { critical: by('critical'), serious: by('serious'), moderate: by('moderate'), minor: by('minor') };
  record('axe', {
    name,
    project: testInfo.project.name,
    ...sum,
    nodes: Object.fromEntries(violations.map((v) => [v.id, v.nodes.length])),
    sample: Object.fromEntries(violations.slice(0, 12).map((v) => [v.id, String(v.nodes[0]?.target ?? '')])),
  });
  if (violations.length) {
    await testInfo.attach(`axe-${slug(name)}.json`, {
      body: JSON.stringify(
        violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target) })),
        null,
        2,
      ),
      contentType: 'application/json',
    });
  }

  const blocking = [...new Set([...sum.critical, ...sum.serious])];
  const base = readBaseline();
  if (process.env.Q7_A11Y_RECORD === '1') {
    if (blocking.length) base[name] = [...new Set([...(base[name] ?? []), ...blocking])];
    writeBaseline(base);
    return sum;
  }
  const known = new Set(base[name] ?? []);
  const fresh = blocking.filter((id) => !known.has(id));
  const stale = [...known].filter((id) => !blocking.includes(id));
  if (stale.length) testInfo.annotations.push({ type: 'a11y-baseline-stale', description: `${name}: ${stale.join(', ')} ya no ocurren (se puede achicar la baseline)` });
  expect(fresh, `axe critical/serious NUEVOS en "${name}" (no estan en a11y-baseline.json)`).toEqual([]);
  return sum;
}

/** IDs de la baseline en HEAD (git) para verificar que solo se achica. null si no esta versionada. */
export function baselineAtHead(): Record<string, string[]> | null {
  try {
    const out = execFileSync('git', ['show', 'HEAD:apps/web/e2e/a11y-baseline.json'], {
      cwd: path.join(E2E_DIR, '..', '..', '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    return JSON.parse(out) as Record<string, string[]>;
  } catch {
    return null;
  }
}

// ── Helpers de viewport / proyecto ─────────────────────────────────────────
export const isMobile = (ti: TestInfo): boolean => ti.project.name === 'mobile-390';
export const isDesktop = (ti: TestInfo): boolean => ti.project.name === 'desktop-1440';
export const onlyChromium = (ti: TestInfo): boolean => ti.project.name !== 'webkit-tablet';

/** Elementos interactivos visibles mas chicos que `min` px en algun eje (excluye enlaces en linea dentro de texto). */
export async function smallTargets(page: Page, min: number, scope?: string) {
  return page.evaluate(
    ({ min, scope }) => {
      const root = scope ? document.querySelector(scope) : document.body;
      if (!root) return [];
      const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch]';
      const out: { name: string; w: number; h: number; tag: string }[] = [];
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none' || el.closest('[aria-hidden="true"],[inert]')) continue;
        // enlace en linea dentro de un parrafo: exento por WCAG 2.5.8
        if (el.tagName === 'A' && st.display === 'inline' && el.closest('p, li, span, td')) continue;
        if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.closest('label')) continue; // el label es el target
        if (r.width + 0.5 < min || r.height + 0.5 < min) {
          out.push({
            name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height),
            tag: el.tagName.toLowerCase(),
          });
        }
      }
      return out;
    },
    { min, scope },
  );
}
