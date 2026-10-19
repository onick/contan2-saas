// apps/api-v2/src/services/reports/range.ts · período anterior para comparar (P4).
// Aritmética de calendario pura sobre 'YYYY-MM-DD' (días locales del tenant).

import { ymdAddDays } from './fmt.js';

const DAY_MS = 86_400_000;

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Período con el que se compara [from, to].
 *  · Rango que empieza el día 1 y termina dentro del mismo mes ("mes hasta hoy"
 *    o mes completo): el mismo tramo del mes anterior (día 1 al día N; si el mes
 *    anterior es más corto, hasta su último día; mes completo -> mes completo).
 *  · Cualquier otro rango: los N días calendario inmediatamente anteriores.
 */
export function previousPeriodYmd(from: string, to: string): { from: string; to: string } {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  if (fd === 1 && fy === ty && fm === tm) {
    const py = fm === 1 ? fy - 1 : fy;
    const pm = fm === 1 ? 12 : fm - 1;
    const prevLast = daysInMonth(py, pm);
    const fullMonth = td === daysInMonth(ty, tm);
    const pd = fullMonth ? prevLast : Math.min(td, prevLast);
    return { from: `${py}-${pad2(pm)}-01`, to: `${py}-${pad2(pm)}-${pad2(pd)}` };
  }
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  return { from: ymdAddDays(from, -days), to: ymdAddDays(from, -1) };
}
