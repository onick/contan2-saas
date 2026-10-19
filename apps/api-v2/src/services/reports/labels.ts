// apps/api-v2/src/services/reports/labels.ts · VOCABULARIO ÚNICO de Reportes.
// Dos familias que conviven a propósito (auditoría 2026-10-19, R4 + R7):
//  1) Registro oficial del departamento (TIPO_ORDER, tipoLabel, PROGRAMAS_DEPTO, MESES_ES/MESES_CORTO,
//     SEMANAS): etiquetas EXACTAS del libro Registro_Actividades_Culturales (Talleres, Charlas, Actividades
//     Especiales…). Las usan monthly-register*.ts.
//  2) Etiquetas de producto y lenguaje natural (TYPE_LABELS, TYPE_KEYWORDS, métricas, salas, fechas en prosa):
//     las usan period-engine.ts y el Asistente.
// Si el departamento cambia un nombre, se cambia AQUÍ y se propaga solo.

import type { ActivityType } from '@contan2/contracts';

// ───────────────────── 1) Registro oficial del departamento ─────────────────────
// apps/api-v2/src/services/reports/labels.ts · vocabulario EXACTO del
// departamento para el libro "Registro_Actividades_Culturales" (decisión del
// dueño P5, auditoría REP-A13). Una sola fuente: el registro mensual/anual, sus
// listas ocultas (dropdowns) y el pivote "Resumen Mensual" salen de aquí.

// Los 5 tipos del departamento, en el orden de su plantilla.
export const TIPO_ORDER = ['Cine', 'Teatro', 'Talleres', 'Charlas', 'Actividades Especiales'] as const;
export type RegisterTipo = (typeof TIPO_ORDER)[number];

// `activities.type` (contrato) → tipo del departamento. Lo no mapeado cae en
// "Actividades Especiales".
export const TIPO_LABEL: Record<string, RegisterTipo> = {
  cine: 'Cine',
  teatro: 'Teatro',
  taller: 'Talleres',
  conferencia: 'Charlas',
  tertulia: 'Charlas', // conversación/charla en el vocabulario del depto
  concierto: 'Actividades Especiales',
  exposicion: 'Actividades Especiales',
  visita_guiada: 'Actividades Especiales',
  cuentacuentos: 'Actividades Especiales',
  otro: 'Actividades Especiales',
};
export const tipoLabel = (t: string): RegisterTipo => TIPO_LABEL[t] ?? 'Actividades Especiales';

// Programa de una actividad sin ciclo/categoría.
export const PROGRAMA_SIN_CICLO = 'Actividades Especiales';

// Programas oficiales del departamento (siempre disponibles en el dropdown).
export const PROGRAMAS_DEPTO = [
  'Ciclo de Cine Dominicano',
  'Ciclo de Cine Clásico',
  'Temporada de Teatro',
  'Ciclo de Cine de Embajada',
  'Proyecciones fuera de ciclo',
  'Otras Obras de teatro',
  'Actividades Especiales',
] as const;

export const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;
export const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;
export const monthNameEs = (m: number): string => MESES_ES[m - 1] ?? '';

// Semana del mes: vocabulario 1–5.
export const SEMANAS = [1, 2, 3, 4, 5] as const;

// ───────────────────── 2) Producto y lenguaje natural (Asistente) ─────────────────────
// apps/api-v2/src/services/reports/labels.ts · VOCABULARIO ÚNICO de reportería.
//
// Una sola fuente para las palabras que el Asistente reconoce (meses, tipos de
// actividad, métricas, salas) y para las etiquetas que muestra (tipos, métricas,
// fechas en prosa). Todo el matching se hace sobre texto normalizado (sin
// acentos, minúsculas), así que aquí las palabras clave van SIN acentos y se
// toleran ambas grafías al escribir. Sin regionalismos: español neutro.


// Normaliza para matching: minúsculas, sin acentos, sin puntuación ("¿?¡!.,"),
// espacios colapsados. Conserva letras y números (años).
export function normText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Meses ───────────────────────────────────────────────────────────────────
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;
/** Grafías alternativas aceptadas al ESCRIBIR (se normalizan al mes canónico). */
export const MONTH_ALIASES: Record<string, string> = { setiembre: 'septiembre' };
export const monthName = (m: number): string => MONTHS[m - 1]!;

// ── Tipos de actividad ──────────────────────────────────────────────────────
export const TYPE_LABELS: Record<string, string> = {
  exposicion: 'Exposición', concierto: 'Concierto', cine: 'Cine', taller: 'Taller',
  teatro: 'Teatro', conferencia: 'Conferencia',
  tertulia: 'Tertulia', visita_guiada: 'Visita guiada', cuentacuentos: 'Cuenta cuentos',
  otro: 'Otro',
};

/** Palabras (normalizadas, singular y plural) que nombran un tipo de actividad. */
export const TYPE_KEYWORDS: Record<Exclude<ActivityType, 'otro'>, string[]> = {
  cine: ['cine', 'pelicula', 'peliculas', 'proyeccion', 'proyecciones'],
  taller: ['taller', 'talleres'],
  concierto: ['concierto', 'conciertos', 'recital', 'recitales'],
  teatro: ['teatro', 'obra de teatro', 'obras de teatro'],
  exposicion: ['exposicion', 'exposiciones'],
  conferencia: ['conferencia', 'conferencias', 'charla', 'charlas'],
  tertulia: ['tertulia', 'tertulias'],
  visita_guiada: ['visita guiada', 'visitas guiadas'],
  cuentacuentos: ['cuentacuentos', 'cuenta cuentos'],
};

/** Tipos citados en un texto normalizado (frases largas primero) + el texto sin ellos. */
export function extractTypes(n: string): { types: string[]; rest: string } {
  const entries = (Object.entries(TYPE_KEYWORDS) as Array<[string, string[]]>)
    .flatMap(([type, words]) => words.map((w) => ({ type, w })))
    .sort((a, b) => b.w.length - a.w.length);
  const types: string[] = [];
  let rest = n;
  for (const { type, w } of entries) {
    const re = new RegExp(`\\b${w}\\b`, 'g');
    if (re.test(rest)) {
      if (!types.includes(type)) types.push(type);
      rest = rest.replace(re, ' ');
    }
  }
  return { types, rest: rest.replace(/\s+/g, ' ').trim() };
}

// ── Métricas ────────────────────────────────────────────────────────────────
export type MetricKey = 'people' | 'attendances' | 'uniqueVisitors' | 'occupancyPct' | 'activities';

/** Orden = prioridad (la primera métrica de la lista que aparezca gana). */
export const METRIC_KEYWORDS: Array<{ key: MetricKey; words: string[] }> = [
  { key: 'uniqueVisitors', words: ['visitantes unicos', 'visitante unico', 'personas unicas', 'personas distintas', 'unicos'] },
  { key: 'occupancyPct', words: ['ocupacion', 'aforo', 'llenado'] },
  { key: 'attendances', words: ['check ins', 'check in', 'checkins', 'checkin', 'registros', 'entradas', 'ingresos'] },
  { key: 'activities', words: ['actividades', 'eventos', 'funciones'] },
  { key: 'people', words: ['personas', 'gente', 'asistencias', 'asistencia', 'asistentes', 'asistieron', 'asistio', 'publico', 'visitantes', 'visitas', 'vinieron', 'vino', 'visitaron', 'visito', 'participantes', 'concurrencia'] },
];

export const METRIC_LABELS: Record<MetricKey, { title: string; unit: string }> = {
  people: { title: 'Personas', unit: 'personas' },
  attendances: { title: 'Registros', unit: 'registros' },
  uniqueVisitors: { title: 'Visitantes únicos', unit: 'visitantes únicos' },
  occupancyPct: { title: 'Ocupación', unit: '% de ocupación' },
  activities: { title: 'Actividades', unit: 'actividades' },
};

/** Primera métrica nombrada (por prioridad) + el texto sin ninguna palabra de métrica. */
export function extractMetric(n: string): { metric: MetricKey | null; rest: string; words: string[] } {
  let metric: MetricKey | null = null;
  let rest = n;
  const words: string[] = [];
  for (const { key, words: ws } of METRIC_KEYWORDS) {
    for (const w of [...ws].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`\\b${w}\\b`, 'g');
      if (re.test(rest)) {
        if (!metric) metric = key;
        words.push(w);
        rest = rest.replace(re, ' ');
      }
    }
  }
  return { metric, rest: rest.replace(/\s+/g, ' ').trim(), words };
}

// ── Salas permanentes (Puerta) ──────────────────────────────────────────────
export const SALA_TRIGGER = /\b(sala|salas|puerta|vr|realidad virtual|ada balcacer|ada)\b/;
/** Palabras que NO identifican una sala concreta. */
export const SALA_NOISE = new Set(['sala', 'salas', 'puerta', 'visitas', 'visita', 'gente', 'personas', 'pasaron', 'paso', 'entraron', 'entro']);
/** Grupos de sinónimos: citar uno equivale a citar cualquiera (el nombre real de la sala puede usar otro). */
export const SALA_ALIAS_GROUPS: string[][] = [
  ['vr', 'realidad virtual'],
  ['ada', 'balcacer', 'ada balcacer'],
];

// ── Palabras de relleno (no aportan nombre de actividad) ────────────────────
export const FILLERS = [
  'como le fue', 'como fue', 'por favor',
  'dame', 'dime', 'muestrame', 'ver', 'emite', 'emitir', 'genera', 'generar', 'descarga', 'descargar',
  'quiero', 'necesito', 'cuantas', 'cuantos', 'cuanta', 'cuanto', 'que', 'cual', 'cuales', 'fueron', 'fue', 'hubo', 'hay', 'tuvimos', 'tuvo', 'tenemos',
  'hubieron', 'paso', 'pasaron', 'total', 'totales', 'numero', 'cantidad', 'reporte', 'informe', 'completo', 'completa',
  'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'en', 'me', 'por', 'pdf', 'excel', 'xlsx',
  'estadisticas', 'stats', 'a', 'al', 'durante', 'para', 'sobre', 'le', 'lo',
];

// ── Fechas en prosa ─────────────────────────────────────────────────────────
const parts = (ymd: string): [number, number, number] => {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y!, m!, d!];
};

/** "19 de octubre de 2026". */
export function formatDateEs(ymd: string): string {
  const [y, m, d] = parts(ymd);
  return `${d} de ${monthName(m)} de ${y}`;
}

/** "1 al 19 de octubre de 2026" · "19 de octubre de 2026" · nunca ISO. */
export function formatRangeEs(from: string, to: string): string {
  if (from === to) return formatDateEs(from);
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  if (fy === ty && fm === tm) return `${fd} al ${td} de ${monthName(tm)} de ${ty}`;
  if (fy === ty) return `${fd} de ${monthName(fm)} al ${td} de ${monthName(tm)} de ${ty}`;
  return `${formatDateEs(from)} al ${formatDateEs(to)}`;
}
