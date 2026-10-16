// Portado de arc-library (https://github.com/kuratlielia/arc-library) · MIT © 2026 Elia Kuratli.
// Origen: registry/components/date-range-picker/date-range-picker.tsx @ b40c890 (2026-10-16). Adaptado a contan2: Tailwind v4 +
// tokens de marca por tenant, sin `motion` (CSS + prefers-reduced-motion), es-DO. Ver ../ATTRIBUTION.md.

import { addDays, addMonths, monthEnd, monthStart, rangeLength, sameRange, startOfWeek, type Ymd, type YmdRange } from './ymd';

export interface RangePreset {
  key: string;
  label: string;
  /** Recibe el "hoy" de la zona del tenant (America/Santo_Domingo), nunca el del dispositivo. */
  range: (today: Ymd) => YmdRange;
}

export const DEFAULT_PRESETS: RangePreset[] = [
  { key: 'hoy', label: 'Hoy', range: (t) => ({ from: t, to: t }) },
  { key: 'semana', label: 'Esta semana', range: (t) => ({ from: startOfWeek(t, 1), to: t }) },
  { key: 'mes', label: 'Este mes', range: (t) => ({ from: monthStart(t), to: t }) },
  { key: 'mesPasado', label: 'Mes pasado', range: (t) => { const p = addMonths(t, -1); return { from: monthStart(p), to: monthEnd(p) }; } },
  { key: '30d', label: 'Últimos 30 días', range: (t) => ({ from: addDays(t, -29), to: t }) },
  { key: '90d', label: 'Últimos 90 días', range: (t) => ({ from: addDays(t, -89), to: t }) },
  { key: 'anio', label: 'Este año', range: (t) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }) },
];

export const DEFAULT_PRESET_KEY = 'mes';

export const findPreset = (key: string | null | undefined, presets: RangePreset[] = DEFAULT_PRESETS): RangePreset | undefined =>
  key ? presets.find((p) => p.key === key) : undefined;

export const isPresetKey = (key: unknown, presets: RangePreset[] = DEFAULT_PRESETS): key is string =>
  typeof key === 'string' && presets.some((p) => p.key === key);

/** Clave del primer preset que coincide con el rango dado "hoy", o null. */
export function matchPreset(range: YmdRange, today: Ymd, presets: RangePreset[] = DEFAULT_PRESETS): string | null {
  return presets.find((p) => sameRange(p.range(today), range))?.key ?? null;
}

export type RangeProblem = 'order' | 'maxDays' | 'bounds';

/** null si el rango es aplicable; si no, el motivo. `max` ya resuelto a YMD (no 'today'). */
export function validateRange(r: YmdRange, opts: { maxDays?: number; min?: Ymd; max?: Ymd }): RangeProblem | null {
  if (r.from > r.to) return 'order';
  if ((opts.min && r.from < opts.min) || (opts.max && r.to > opts.max)) return 'bounds';
  if (opts.maxDays && rangeLength(r) > opts.maxDays) return 'maxDays';
  return null;
}
