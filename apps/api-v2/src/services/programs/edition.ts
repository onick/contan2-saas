// apps/api-v2/src/services/programs/edition.ts · edición derivada de un ciclo.
//
// Un programa cíclico incrementa su edición cada año (ej. Cine Dominicano:
// 2026 = 5ta). NO se almacena por actividad: se deriva del año + el ancla del
// programa (edition_anchor_year / edition_anchor_number). Cambiar el ancla
// recalcula todo. El slug del programa reusa slugifyCategory para quedar 1:1
// con el slug del texto de activities.category (segmentos/reportes).

import { slugifyCategory } from '../../routes/segments.js';

export const programSlug = slugifyCategory;

// Ordinales masculinos abreviados (para "ciclo"/"edición"): 5 → "5to".
const ORDINALS = ['', '1ro', '2do', '3ro', '4to', '5to', '6to', '7mo', '8vo', '9no', '10mo'] as const;
export function ordinalEs(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n);
  return ORDINALS[n] ?? `${n}.º`;
}

export interface EditionConfig {
  is_cyclical: boolean;
  edition_anchor_year: number | null;
  edition_anchor_number: number | null;
  edition_noun: string;
}

// Número de edición para un año dado (null si el programa no es cíclico o le
// falta el ancla). Puede dar <1 para años previos al ancla — lo dejamos pasar
// (informativo); quien llama decide si mostrarlo.
export function editionFor(p: EditionConfig, year: number): number | null {
  if (!p.is_cyclical || p.edition_anchor_year == null || p.edition_anchor_number == null) return null;
  return p.edition_anchor_number + (year - p.edition_anchor_year);
}

// Etiqueta legible de la edición ("5to ciclo"). null si no aplica o edición <1.
export function editionLabel(p: EditionConfig, year: number): string | null {
  const n = editionFor(p, year);
  if (n == null || n < 1) return null;
  return `${ordinalEs(n)} ${p.edition_noun || 'ciclo'}`;
}
