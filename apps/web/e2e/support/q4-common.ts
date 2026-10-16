// support/q4-common.ts · helpers de Q4 (Reportes, Protocolo, Puerta). Solo staging.
// - exceljs se carga desde apps/api-v2 (ya es dependencia alli; apps/web no lo tiene).
// - pdf.js (cdnjs) dentro de una pagina en blanco para leer texto, color y rasterizar PDFs.
// - fixtures cacheados por corrida (un worker reiniciado tras un fallo no repite altas).
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_DIR, E2E_DIR } from '../env';
import { ledgerDir, record, runId } from '../fixtures/data';
import { jsonOf, makePng, trackActivity } from './q3-api';

// ---------------------------------------------------------------------------
// Fechas (zona America/Santo_Domingo)
// ---------------------------------------------------------------------------
const DR = 'America/Santo_Domingo';
export function ymdDR(offsetDays = 0, base = new Date()): string {
  const d = new Date(base.getTime() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: DR }).format(d);
}
export function ymdUTC(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
export function hhmmDR(d: Date | string): string {
  return new Intl.DateTimeFormat('es', { timeZone: DR, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
}
/** ISO de "<ymd> <hh>:<mm>" en hora de Santo Domingo (UTC-4 todo el año, sin DST). */
export function isoFromDR(ymd: string, hh: number, mm = 0): string {
  return new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-04:00`).toISOString();
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------
export interface XCell { value: unknown; text: string }
export interface XSheet {
  name: string;
  state?: string;
  rowCount: number;
  columnCount: number;
  rows: unknown[][]; // valores crudos (1-indexed -> indice 0 = columna 1)
  merges: string[];
  dataValidations: Array<{ address: string; type?: string; formulae?: unknown[] }>;
}
export interface XBook { creator?: string; sheets: XSheet[] }

type ExcelNs = { Workbook: new () => { xlsx: { load(b: Buffer): Promise<unknown> }; creator?: string; worksheets: any[] } };
function excelNs(): ExcelNs {
  const req = createRequire(path.join(E2E_DIR, '..', '..', 'api-v2', 'package.json'));
  const mod = req('exceljs') as ExcelNs & { default?: ExcelNs };
  return mod.default ?? mod;
}
const plain = (v: unknown): unknown => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { richText?: Array<{ text: string }>; result?: unknown; text?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if ('result' in o) return o.result;
    if ('text' in o) return o.text;
  }
  return v;
};

export async function parseXlsx(buf: Buffer): Promise<XBook> {
  const E = excelNs();
  const wb = new E.Workbook();
  await wb.xlsx.load(buf);
  const sheets: XSheet[] = wb.worksheets.map((ws: any) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row: any, n: number) => {
      const vals: unknown[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(plain(row.getCell(c).value));
      rows[n - 1] = vals;
    });
    const dv = (ws.dataValidations?.model ?? {}) as Record<string, { type?: string; formulae?: unknown[] }>;
    return {
      name: ws.name as string,
      state: ws.state as string,
      rowCount: ws.rowCount as number,
      columnCount: ws.columnCount as number,
      rows,
      merges: Object.keys(ws._merges ?? {}),
      dataValidations: Object.entries(dv).map(([address, v]) => ({ address, type: v.type, formulae: v.formulae })),
    };
  });
  return { creator: wb.creator, sheets };
}

export const sheetOf = (b: XBook, re: RegExp | string): XSheet | undefined =>
  b.sheets.find((s) => (typeof re === 'string' ? s.name === re : re.test(s.name)));

/** Aplana una hoja a texto (para buscar etiquetas sin depender de la fila exacta). */
export function sheetText(s: XSheet): string {
  return s.rows.flat().filter((v) => v !== null && v !== undefined).map((v) => (v instanceof Date ? v.toISOString() : String(v))).join('\n');
}

/** Fila cuya primera celda no vacia coincide con `label`; devuelve la fila completa. */
export function findRow(s: XSheet, pred: (r: unknown[]) => boolean): unknown[] | undefined {
  return s.rows.find((r) => r && pred(r));
}

// ---------------------------------------------------------------------------
// PDF (pdf.js desde cdnjs en una pagina en blanco)
// ---------------------------------------------------------------------------
export interface PdfInfo {
  pages: number;
  text: string; // texto de todas las paginas
  firstPagePng: Buffer;
  /** Color dominante NO neutro (saturado) de la 1ª pagina, hex. */
  accentHex: string | null;
  hasImages: boolean;
}

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

export async function inspectPdf(page: Page, buf: Buffer, outPng?: string): Promise<PdfInfo> {
  await page.goto('about:blank');
  await page.setContent('<html><body style="margin:0"><canvas id="c"></canvas></body></html>');
  await page.addScriptTag({ url: `${PDFJS}/pdf.min.js` });
  const b64 = buf.toString('base64');
  const res = await page.evaluate(
    async ({ b64, worker }) => {
      const w = window as unknown as { pdfjsLib: any };
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const doc = await w.pdfjsLib.getDocument({ data: bytes }).promise;
      let text = '';
      let hasImages = false;
      for (let p = 1; p <= doc.numPages; p++) {
        const pg = await doc.getPage(p);
        const tc = await pg.getTextContent();
        text += tc.items.map((i: { str: string }) => i.str).join(' ') + '\n';
        if (p === 1) {
          const ops = await pg.getOperatorList();
          const OPS = w.pdfjsLib.OPS;
          hasImages = ops.fnArray.some((f: number) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject);
        }
      }
      const pg1 = await doc.getPage(1);
      const vp = pg1.getViewport({ scale: 1.2 });
      const canvas = document.getElementById('c') as HTMLCanvasElement;
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d')!;
      await pg1.render({ canvasContext: ctx, viewport: vp }).promise;
      // color de acento: el pixel saturado mas frecuente (cuantizado)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const counts = new Map<string, number>();
      for (let i = 0; i < data.length; i += 4 * 3) {
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx - mn < 60) continue; // gris/blanco/negro
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let best = '';
      let n = 0;
      for (const [k, c] of counts) if (c > n) { best = k; n = c; }
      const accent = best ? '#' + best.split(',').map((x) => (Number(x) * 16 + 8).toString(16).padStart(2, '0')).join('') : null;
      return { pages: doc.numPages as number, text, hasImages, accent, png: canvas.toDataURL('image/png').split(',')[1]! };
    },
    { b64, worker: `${PDFJS}/pdf.worker.min.js` },
  );
  const png = Buffer.from(res.png, 'base64');
  if (outPng) {
    mkdirSync(path.dirname(outPng), { recursive: true });
    writeFileSync(outPng, png);
  }
  return { pages: res.pages, text: res.text, firstPagePng: png, accentHex: res.accent, hasImages: res.hasImages };
}

export function hexDist(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  return Math.hypot(r1! - r2!, g1! - g2!, b1! - b2!);
}

// ---------------------------------------------------------------------------
// Artefactos y fixtures cacheados
// ---------------------------------------------------------------------------
export function saveArtifact(name: string, buf: Buffer): string {
  const dir = path.join(ARTIFACTS_DIR, runId());
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name);
  writeFileSync(f, buf);
  return f;
}

export async function q4Fixture<T>(name: string, factory: () => Promise<T>): Promise<T> {
  const dir = ledgerDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `q4-${name}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  const value = await factory();
  writeFileSync(file, JSON.stringify(value));
  return value;
}

/** Limpieza de una fila de asistencia creada por una prueba (se borra antes de cancelar/borrar la actividad). */
export function trackAttendanceRow(id: string, label: string): void {
  record({ kind: 'reservation', label, id, cleanup: [{ method: 'DELETE', path: `/app/check-in/api/attendance/${id}` }] });
}
/** Reserva de la agenda VR: se cancela (la API no la borra). */
export function trackBooking(id: string, label: string): void {
  record({
    kind: 'reservation',
    label,
    id,
    cleanup: [{ method: 'PATCH', path: `/app/puerta/api/bookings/${id}`, body: { action: 'cancel' } }],
  });
}

// ---------------------------------------------------------------------------
// Actividad [E2E] con categoria / fecha explicita
// ---------------------------------------------------------------------------
export interface Q4Activity { id: string; name: string; category: string | null }
export async function q4CreateActivity(
  api: APIRequestContext,
  name: string,
  o: { capacity?: number; startISO?: string; category?: string; type?: string } = {},
): Promise<Q4Activity> {
  const start = o.startISO ? new Date(o.startISO) : new Date(Date.now() + 3 * 60_000);
  const end = new Date(start.getTime() + 120 * 60_000);
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    name,
    type: o.type ?? 'otro',
    location: 'Sala E2E',
    date: start.toISOString(),
    endDate: end.toISOString(),
    capacity: String(o.capacity ?? 20),
    audience: 'adultos',
    cover: { name: 'cover.png', mimeType: 'image/png', buffer: makePng() },
  };
  if (o.category) multipart.category = o.category;
  const res = await api.post('/app/actividades/api/with-cover', { multipart });
  if (res.status() !== 201) throw new Error(`q4CreateActivity "${name.slice(0, 40)}": HTTP ${res.status()}`);
  const body = await jsonOf<{ activity: { id: string; category?: string | null } }>(res);
  trackActivity(body.activity.id, name);
  return { id: body.activity.id, name, category: body.activity.category ?? null };
}

export async function getJson<T = Record<string, any>>(api: APIRequestContext, url: string): Promise<{ status: number; body: T; res: APIResponse }> {
  const res = await api.get(url);
  return { status: res.status(), body: await jsonOf<T>(res), res };
}

export const isNonEmptyXlsx = (b: Buffer): boolean => b.length > 2_000 && b[0] === 0x50 && b[1] === 0x4b;
