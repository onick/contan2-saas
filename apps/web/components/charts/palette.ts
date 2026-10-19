// components/charts/palette.ts · ÚNICA fuente del color de las gráficas (REP-A16).
// Los valores viven como tokens en app/globals.css (--chart-1…8, --chart-prev);
// aquí solo se referencian con var() y se fija el mapeo estable tipo → token
// (el cine siempre es el mismo color en Reportes, Puerta y los dashboards).

export const chartVar = (n: number): string => `var(--chart-${n})`;

/** Serie principal = marca del tenant. */
export const CHART_MAIN = chartVar(1);
/** Serie secundaria (p. ej. barras por día) = secundario del tenant. */
export const CHART_SECONDARY = chartVar(2);
/** Serie del período anterior (trazo punteado). */
export const CHART_PREV = 'var(--chart-prev)';
/** Neutro: «otro», «anónimos», sin categoría. */
export const CHART_NEUTRAL = chartVar(8);

/** Paleta categórica en orden de uso (1 = marca … 8 = neutro). */
export const PALETTE: string[] = [1, 2, 3, 4, 5, 6, 7, 8].map(chartVar);

/** Mapeo estable tipo de actividad → color. */
export const TYPE_COLOR: Record<string, string> = {
  cine: chartVar(1),
  concierto: chartVar(3),
  taller: chartVar(4),
  exposicion: chartVar(6),
  teatro: chartVar(5),
  conferencia: chartVar(2),
  tertulia: chartVar(7),
  // Sin token propio: mezcla de dos tokens para no repetir color exacto.
  visita_guiada: 'color-mix(in oklch, var(--chart-2) 55%, var(--chart-6))',
  cuentacuentos: 'color-mix(in oklch, var(--chart-5) 55%, var(--chart-4))',
  otro: CHART_NEUTRAL,
};

/** Fondo suave (12 %) de un color de gráfica, para miniaturas/chips. */
export const tintOf = (color: string, pct = 12): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
