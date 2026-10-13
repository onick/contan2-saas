// lib/format.ts — formateadores de fecha, número y tiempo relativo.
// Todos usan Intl con timeZone explícito (por defecto 'America/Santo_Domingo')
// para que servidor y cliente coincidan aunque el sistema tenga otra zona horaria.

const DEFAULT_TZ = 'America/Santo_Domingo';

export interface FormatOpts { timeZone?: string }

export function fecha(d: Date | string, opts?: FormatOpts): string {
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: opts?.timeZone ?? DEFAULT_TZ,
  }).format(new Date(d));
}

export function hora(d: Date | string, opts?: FormatOpts): string {
  return new Intl.DateTimeFormat('es-DO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: opts?.timeZone ?? DEFAULT_TZ,
  }).format(new Date(d));
}

export function fechaHora(d: Date | string, opts?: FormatOpts): string {
  const dt = new Date(d);
  return `${fecha(dt, opts)} · ${hora(dt, opts)}`;
}

export function numero(n: number, _opts?: FormatOpts): string {
  return new Intl.NumberFormat('es-DO').format(n);
}

export function porcentaje(n: number, _opts?: FormatOpts): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(n / 100);
}

// Tiempo relativo: "hace 5 min", "hace 2 h", "ayer" (día calendario anterior en
// la zona), "hace N días" (<7 días calendario); a partir de 7 días: fecha(d).
// ahora acepta Date | string | number (ms); por defecto usa Date.now().
export function haceTiempo(
  d: Date | string,
  ahora?: Date | string | number,
  opts?: FormatOpts,
): string {
  const tz = opts?.timeZone ?? DEFAULT_TZ;
  const nowMs = typeof ahora === 'number' ? ahora
    : ahora !== undefined ? new Date(ahora).getTime()
    : Date.now();
  const diff = Math.max(0, nowMs - new Date(d).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  // Comparar días calendario en la zona horaria (evita "ayer" para días de hace 2+)
  const dayStr = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  const calDiff = Math.round(
    (Date.parse(dayStr(nowMs) + 'T00:00:00Z') - Date.parse(dayStr(new Date(d).getTime()) + 'T00:00:00Z'))
    / 86_400_000,
  );
  if (calDiff === 1) return 'ayer';
  if (calDiff < 7) return `hace ${calDiff} días`;
  return fecha(d, opts);
}
