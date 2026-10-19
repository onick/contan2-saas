// Filtros del dashboard de Reportes que viajan en la URL (?from&to&preset&types&categories).
// Puro y sin 'use client': lo usan la página (servidor) y el dashboard (cliente).

import { DEFAULT_PRESETS, DEFAULT_PRESET_KEY, findPreset, isPresetKey, matchPreset } from '../ui/arc/date-range-picker/presets';
import { isYmd, rangeLength, type Ymd, type YmdRange } from '../ui/arc/date-range-picker/ymd';

/** Mismo tope que MAX_REPORT_RANGE_DAYS de api-v2 (services/report-data.ts). */
export const MAX_RANGE_DAYS = 366;

export const REPORT_TYPE_OPTIONS: Array<{ v: string; l: string }> = [
  { v: 'concierto', l: 'Concierto' }, { v: 'cine', l: 'Cine' }, { v: 'taller', l: 'Taller' },
  { v: 'exposicion', l: 'Exposición' }, { v: 'teatro', l: 'Teatro' }, { v: 'conferencia', l: 'Conferencia' },
  { v: 'tertulia', l: 'Tertulia' }, { v: 'visita_guiada', l: 'Visita guiada' }, { v: 'cuentacuentos', l: 'Cuenta cuentos' },
  { v: 'otro', l: 'Otro' },
];
const TYPE_VALUES = new Set(REPORT_TYPE_OPTIONS.map((o) => o.v));

export interface ReportFilters {
  range: YmdRange;
  /** Atajo vigente (coincide con el rango) o null = «Personalizado». */
  preset: string | null;
  types: string[];
  categories: string[];
}

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));
const list = (v: string | string[] | undefined): string[] =>
  one(v).split(',').map((s) => s.trim()).filter(Boolean);

/** Filtros por defecto: «Este mes» sobre el hoy dado (el del tenant, no el del servidor). */
export function defaultReportFilters(today: Ymd): ReportFilters {
  const range = findPreset(DEFAULT_PRESET_KEY)!.range(today);
  return { range, preset: DEFAULT_PRESET_KEY, types: [], categories: [] };
}

/**
 * Lee y valida los searchParams. Un rango inválido (no-YMD, from>to o >366 días) cae a «Este mes»; los tipos
 * desconocidos se descartan; el atajo solo se respeta si coincide con el rango.
 */
export function parseReportFilters(sp: Raw | undefined, today: Ymd): ReportFilters {
  const base = defaultReportFilters(today);
  if (!sp) return base;
  const from = one(sp.from), to = one(sp.to);
  let range = base.range;
  let preset: string | null = base.preset;
  if (isYmd(from) && isYmd(to) && from <= to && rangeLength({ from, to }) <= MAX_RANGE_DAYS) {
    range = { from, to };
    const asked = one(sp.preset);
    const askedOk = isPresetKey(asked) && findPreset(asked)!.range(today).from === from && findPreset(asked)!.range(today).to === to;
    preset = askedOk ? asked : matchPreset(range, today, DEFAULT_PRESETS);
  }
  const types = list(sp.types).filter((t) => TYPE_VALUES.has(t));
  const categories = list(sp.categories).filter((c) => c.length <= 120).slice(0, 20);
  return { range, preset, types, categories };
}

/** Querystring canónico para `history.replaceState`. */
export function filtersToSearch(f: ReportFilters): string {
  const p = new URLSearchParams({ from: f.range.from, to: f.range.to });
  if (f.preset) p.set('preset', f.preset);
  if (f.types.length) p.set('types', f.types.join(','));
  if (f.categories.length) p.set('categories', f.categories.join(','));
  return p.toString();
}

/** Querystring del período (rango + tipos + ciclos) para el resumen y los informes del período. */
export function reportsQuery(from: string, to: string, types?: string[], categories?: string[]): string {
  const p = new URLSearchParams({ from, to });
  if (types && types.length) p.set('types', types.join(','));
  if (categories && categories.length) p.set('categories', categories.join(','));
  return p.toString();
}

interface PeriodFilters { from: string; to: string; types: string[]; categories: string[] }

/** Informe del período (PDF/Excel) con TODOS los filtros del dashboard. */
export function periodHref(kind: 'pdf' | 'xlsx', f: PeriodFilters): string {
  return `/app/reportes/api/period?kind=${kind}&${reportsQuery(f.from, f.to, f.types, f.categories)}`;
}

/**
 * «Asistencia por actividad» (/reports/attendance-by-activity) en csv/xlsx/pdf. Acepta los mismos filtros que el
 * dashboard (`types` y `categories`, con la misma semántica en la API) y, opcionalmente, UN ciclo elegido aparte
 * (`category`, el selector «Un ciclo o categoría» del panel de descargas).
 */
export function attendanceHref(format: 'csv' | 'xlsx' | 'pdf', f: PeriodFilters | (Omit<PeriodFilters, 'categories'> & { category: string })): string {
  const p = new URLSearchParams({ from: f.from, to: f.to, format });
  if (f.types.length) p.set('types', f.types.join(','));
  if ('category' in f) p.set('category', f.category);
  else if (f.categories.length) p.set('categories', f.categories.join(','));
  return `/app/reportes/api/attendance?${p.toString()}`;
}

/** Registro mensual en el formato del departamento (mes 1-12). */
export function monthHref(year: number, month: number): string {
  return `/app/reportes/api/month?year=${year}&month=${month}`;
}

/** Libro anual (Ene–Dic + Resumen Mensual + Listas) en el formato oficial del departamento. */
export function yearHref(year: number): string {
  return `/app/reportes/api/year?year=${year}`;
}
