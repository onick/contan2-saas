// Formato y parseo de fecha-hora local para DateTimeField. Puro (sin React) y sin depender de la zona del dispositivo:
// el valor es 'YYYY-MM-DDTHH:mm' (igual que datetime-local) y se interpreta como «hora de pared».

import { DEFAULT_TZ, addDays, isYmd, parts, todayYmd, weekdayOf, type Ymd } from '../date-range-picker/ymd';

/** 'YYYY-MM-DDTHH:mm' (hora local, sin zona). */
export type LocalDateTime = string;

const LOCAL_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

export interface LocalParts { date: Ymd; hour: number; minute: number }

const pad = (n: number) => String(n).padStart(2, '0');

/** Descompone 'YYYY-MM-DDTHH:mm'; null si no es válido (fecha inexistente u hora fuera de 0-23 / 0-59). */
export function splitLocal(v: unknown): LocalParts | null {
  if (typeof v !== 'string') return null;
  const m = LOCAL_RE.exec(v);
  if (!m || !isYmd(m[1])) return null;
  const hour = Number(m[2]), minute = Number(m[3]);
  if (hour > 23 || minute > 59) return null;
  return { date: m[1]!, hour, minute };
}

export const isLocalDateTime = (v: unknown): v is LocalDateTime => splitLocal(v) !== null;

export function joinLocal(date: Ymd, hour: number, minute: number): LocalDateTime {
  return `${date}T${pad(hour)}:${pad(minute)}`;
}

/** Hora 0-23 → { hour12: 1-12, pm }. 0 → 12 a. m.; 12 → 12 p. m. */
export function to12h(hour: number): { hour12: number; pm: boolean } {
  return { hour12: hour % 12 === 0 ? 12 : hour % 12, pm: hour >= 12 };
}

/** Inverso de to12h. */
export function from12h(hour12: number, pm: boolean): number {
  return (hour12 % 12) + (pm ? 12 : 0);
}

const FORMATTER = new Intl.DateTimeFormat('es-DO', {
  day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
});

/** "12/11/2026, 7:00 p. m." (es-DO). '' si el valor no es válido. Los espacios finos de ICU se normalizan a ' '. */
export function formatDateTime(v: string): string {
  const p = splitLocal(v);
  if (!p) return '';
  const { y, m, d } = parts(p.date);
  return FORMATTER.format(new Date(Date.UTC(y, m - 1, d, p.hour, p.minute))).replace(/[  ]/g, ' ');
}

// d/m/yyyy [,] h:mm [meridiano]. Separadores de fecha: / - . ; año de 2 o 4 dígitos (2 → 20xx).
const TEXT_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?:\s*,\s*|\s+)(\d{1,2})[:.](\d{2})\s*(?:([ap])\.?\s*m\.?)?$/;

/**
 * Parseo tolerante: «12/11/2026, 7:00 p. m.», «12/11/2026 7:00pm», «12-11-26 19:00». Con meridiano la hora debe ir 1-12;
 * sin él se asume 24 h. Devuelve null si no calza o si la fecha/hora no existe.
 */
export function parseDateTime(text: string): LocalDateTime | null {
  const t = text.normalize('NFKC').replace(/[  ]/g, ' ').trim().toLowerCase();
  const m = TEXT_RE.exec(t);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  let hour = Number(m[4]);
  const minute = Number(m[5]);
  const mer = m[6];
  if (minute > 59) return null;
  if (mer) {
    if (hour < 1 || hour > 12) return null;
    hour = from12h(hour, mer === 'p');
  } else if (hour > 23) return null;
  const date = `${String(y).padStart(4, '0')}-${pad(mo)}-${pad(d)}`;
  if (!isYmd(date)) return null;
  return joinLocal(date, hour, minute);
}

/** true si v está dentro de [min, max] (cadenas comparables); min/max vacíos o inválidos se ignoran. */
export function withinBounds(v: LocalDateTime, min?: string, max?: string): boolean {
  if (isLocalDateTime(min) && v < min) return false;
  if (isLocalDateTime(max) && v > max) return false;
  return true;
}

/** Ajusta v al intervalo [min, max]. */
export function clampLocal(v: LocalDateTime, min?: string, max?: string): LocalDateTime {
  if (isLocalDateTime(min) && v < min) return min;
  if (isLocalDateTime(max) && v > max) return max;
  return v;
}

/** Fecha y hora de pared en la zona dada (no la del dispositivo). */
export function nowLocal(timeZone: string = DEFAULT_TZ, now: Date = new Date()): LocalParts {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { date: todayYmd(timeZone, now), hour: n('hour') % 24, minute: n('minute') };
}

/** «Ahora» redondeado hacia arriba a la siguiente media hora (10:00 → 10:30; 10:01 → 10:30; 10:30 → 11:00). */
export function nextHalfHour(now: LocalParts): LocalDateTime {
  const total = now.hour * 60 + now.minute;
  const next = (Math.floor(total / 30) + 1) * 30;
  if (next >= 24 * 60) return joinLocal(addDays(now.date, 1), 0, 0);
  return joinLocal(now.date, Math.floor(next / 60), next % 60);
}

/** Próximo sábado estrictamente posterior a hoy (si hoy es sábado, el de la semana siguiente). */
export function nextSaturday(today: Ymd): Ymd {
  const wd = weekdayOf(today); // 0 = domingo … 6 = sábado
  return addDays(today, ((6 - wd + 7) % 7) || 7);
}

/** Opciones de minutos según el paso; si el valor actual no cae en el paso se agrega para que el select lo muestre. */
export function minuteOptions(step: number, current?: number): number[] {
  const list = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step).filter((n) => n < 60);
  if (current !== undefined && !list.includes(current)) list.push(current);
  return list.sort((a, b) => a - b);
}
