// Portado de arc-library (https://github.com/kuratlielia/arc-library) · MIT © 2026 Elia Kuratli.
// Origen: registry/components/date-range-picker/date-range-picker.tsx @ b40c890 (2026-10-16). Adaptado a contan2: Tailwind v4 +
// tokens de marca por tenant, sin `motion` (CSS + prefers-reduced-motion), es-DO. Ver ../ATTRIBUTION.md.

// Fechas como cadenas 'YYYY-MM-DD' en la frontera; adentro, días época (Date.UTC / 864e5).
// Sin librerías de fechas y sin depender de la zona del dispositivo.

export type Ymd = string;
export interface YmdRange { from: Ymd; to: Ymd }

export const DEFAULT_TZ = 'America/Santo_Domingo';
const DAY_MS = 86_400_000;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
export const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;
// Índice 0 = domingo.
export const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
export const WEEKDAYS_MIN = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'] as const;

export function isYmd(s: unknown): s is Ymd {
  if (typeof s !== 'string') return false;
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function toDays(ymd: Ymd): number {
  const m = YMD_RE.exec(ymd)!;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

export function fromDays(days: number): Ymd {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

export const parts = (ymd: Ymd) => {
  const m = YMD_RE.exec(ymd)!;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
};

export const addDays = (ymd: Ymd, n: number): Ymd => fromDays(toDays(ymd) + n);
export const diffDays = (a: Ymd, b: Ymd): number => toDays(a) - toDays(b);

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Suma meses recortando el día al largo del mes destino (31 ene + 1 = 28/29 feb). */
export function addMonths(ymd: Ymd, n: number): Ymd {
  const { y, m, d } = parts(ymd);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (((total % 12) + 12) % 12) + 1;
  return fromDays(Math.round(Date.UTC(ny, nm - 1, Math.min(d, daysInMonth(ny, nm))) / DAY_MS));
}

export const monthStart = (ymd: Ymd): Ymd => `${ymd.slice(0, 7)}-01`;
export function monthEnd(ymd: Ymd): Ymd {
  const { y, m } = parts(ymd);
  return `${ymd.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}
export const monthDiff = (a: Ymd, b: Ymd): number => {
  const pa = parts(a), pb = parts(b);
  return (pa.y - pb.y) * 12 + pa.m - pb.m;
};

/** 0 = domingo … 6 = sábado. 1970-01-01 fue jueves. */
export const weekdayOf = (ymd: Ymd): number => (((toDays(ymd) + 4) % 7) + 7) % 7;

export function startOfWeek(ymd: Ymd, weekStartsOn: 0 | 1): Ymd {
  return addDays(ymd, -((weekdayOf(ymd) - weekStartsOn + 7) % 7));
}

/** Largo inclusivo del rango en días. */
export const rangeLength = (r: YmdRange): number => diffDays(r.to, r.from) + 1;

export const sameRange = (a: YmdRange | null | undefined, b: YmdRange | null | undefined): boolean =>
  !!a && !!b && a.from === b.from && a.to === b.to;

/** "Hoy" como YMD en la zona dada (no la del dispositivo). */
export function todayYmd(timeZone: string = DEFAULT_TZ, now: Date = new Date()): Ymd {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Milisegundos hasta la próxima medianoche de la zona (para reprogramar "hoy"). */
export function msUntilMidnight(timeZone: string = DEFAULT_TZ, now: Date = new Date()): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return (24 * 3600 - (n('hour') * 3600 + n('minute') * 60 + n('second'))) * 1000 - now.getMilliseconds();
}

/** "1 – 16 oct 2026" · "28 sep – 16 oct 2026" · "28 dic 2025 – 5 ene 2026" · "16 oct 2026". Determinístico (sin Intl). */
export function formatRangeText(r: YmdRange): string {
  const a = parts(r.from), b = parts(r.to);
  const mo = (n: number) => MONTHS_SHORT[n - 1];
  if (r.from === r.to) return `${b.d} ${mo(b.m)} ${b.y}`;
  if (a.y !== b.y) return `${a.d} ${mo(a.m)} ${a.y} – ${b.d} ${mo(b.m)} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${mo(a.m)} – ${b.d} ${mo(b.m)} ${b.y}`;
  return `${a.d} – ${b.d} ${mo(b.m)} ${b.y}`;
}

export const CUSTOM_LABEL = 'Personalizado';

export function formatRangeLabel(r: YmdRange, presetLabel: string | null): string {
  return `${presetLabel ?? CUSTOM_LABEL} · ${formatRangeText(r)}`;
}

/** "viernes, 16 de octubre de 2026" para el aria-label de un día. */
export function formatDayLong(ymd: Ymd): string {
  const { y, m, d } = parts(ymd);
  return `${WEEKDAYS_LONG[weekdayOf(ymd)]}, ${d} de ${MONTHS_LONG[m - 1]} de ${y}`;
}

export function formatMonthTitle(ymd: Ymd): string {
  const { y, m } = parts(ymd);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}
