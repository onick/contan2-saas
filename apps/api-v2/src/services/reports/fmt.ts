// apps/api-v2/src/services/reports/fmt.ts · fechas/horas de reportería en la
// zona horaria del tenant (CHECKIN_TZ, default America/Santo_Domingo), NUNCA
// en la del servidor (UTC). Centraliza formateo, claves de día/mes y los
// límites de rango [00:00 local del día, 00:00 local del día siguiente).

import { resolveCheckinTz } from '../../routes/checkin.js';

export const REPORT_TZ: string = resolveCheckinTz();

type Input = Date | string | number;
const toDate = (v: Input): Date => (v instanceof Date ? v : new Date(v));
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Formatea un instante en la zona del tenant (es-DO). Devuelve '—' si es inválido. */
export function formatInTz(v: Input | null | undefined, opts: Intl.DateTimeFormatOptions, tz: string = REPORT_TZ): string {
  if (v == null || v === '') return '—';
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-DO', { ...opts, timeZone: tz });
}

export const fmtDateTz = (
  v: Input | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
  tz?: string,
): string => formatInTz(v, opts, tz);
export const fmtTimeTz = (v: Input | null | undefined, tz?: string): string =>
  formatInTz(v, { hour: '2-digit', minute: '2-digit' }, tz);
export const fmtNowTz = (tz?: string): string =>
  formatInTz(new Date(), { dateStyle: 'long', timeStyle: 'short' }, tz);

/** Partes de calendario de un instante en la zona (mes 1-12, hora 0-23, dow 0=Dom). */
export function zonedParts(v: Input, tz: string = REPORT_TZ): { y: number; m: number; d: number; h: number; min: number; s: number; dow: number } {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
  }).formatToParts(toDate(v));
  const get = (t: string): string => p.find((x) => x.type === t)?.value ?? '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), h: Number(get('hour')), min: Number(get('minute')), s: Number(get('second')), dow };
}

/** Hora local (0-23) del instante. */
export const hourInTz = (v: Input, tz?: string): number => zonedParts(v, tz).h;
/** Día de la semana local (0=Dom..6=Sáb). */
export const dowInTz = (v: Input, tz?: string): number => zonedParts(v, tz).dow;
/** Día local 'YYYY-MM-DD'. */
export function ymdInTz(v: Input, tz?: string): string {
  const { y, m, d } = zonedParts(v, tz);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
/** Mes local 'YYYY-MM'. */
export function monthKeyInTz(v: Input, tz?: string): string {
  const { y, m } = zonedParts(v, tz);
  return `${y}-${pad2(m)}`;
}

/** Suma `n` días a un 'YYYY-MM-DD' (aritmética de calendario, sin zona). */
export function ymdAddDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** Instante UTC en el que empieza (00:00 local) el día `ymd` en la zona. */
export function zonedMidnight(ymd: string, tz: string = REPORT_TZ): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, 0, 0, 0);
  let guess = wall;
  for (let i = 0; i < 2; i++) { // 2 pasadas: seguro ante DST
    const p = zonedParts(guess, tz);
    const localAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    guess = wall - (localAsUtc - guess);
  }
  return new Date(guess);
}

/** Día calendario 'YYYY-MM-DD' (ya local del tenant) como "01 oct 2026", sin conversión de zona. */
export function fmtYmd(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Valor de celda Excel para un instante: `Date` a medianoche UTC del día LOCAL del
 * tenant (ExcelJS serializa en UTC; así la hoja muestra el día de RD, no el de UTC).
 * Usar con numFmt 'dd/mm/yyyy'. Inválido -> null (celda vacía).
 */
export function excelDateCell(v: Input | null | undefined): Date | null {
  if (v == null || v === '') return null;
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return null;
  const { y, m, d: day } = zonedParts(d);
  return new Date(Date.UTC(y, m - 1, day));
}
