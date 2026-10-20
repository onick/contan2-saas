// components/puerta/salaColors.ts · identidad de color por sala permanente.
// SOLO decorativa (franja, eyebrow, íconos, dots): los CTA usan el kit (AA).
// El color sale del TIPO de sala (`kind`, migración 057): VR = azul · exposición =
// naranja · otra = acento neutro. NUNCA de la capacidad/aforo (PUE-A09).

import type { PuertaSala } from '@contan2/contracts';

export interface SalaColor { c: string; soft: string; deep: string }
export type SalaKind = NonNullable<PuertaSala['kind']>;

const VR: SalaColor = { c: 'var(--chart-2)', soft: 'var(--color-info-soft)', deep: 'var(--color-info-text)' };
const EXPO: SalaColor = { c: 'var(--chart-1)', soft: 'var(--color-brand-soft)', deep: 'var(--color-brand-text)' };
const OTRA: SalaColor = { c: 'var(--chart-4)', soft: 'var(--color-surface-container)', deep: 'var(--color-ink)' };

/**
 * Color de una sala por su `kind`. Un `kind` ausente (API anterior a la 057) cae
 * en exposición. El camino numérico (aforo) es LEGADO: solo lo usa PuertaBoard
 * hasta que migre a `kind`; no usar en código nuevo.
 */
export function salaColor(kind: SalaKind | number | null | undefined): SalaColor {
  if (typeof kind === 'number') return VR; // legado: aforo != null ⇒ VR
  if (kind === 'vr') return VR;
  if (kind === 'otra') return OTRA;
  return EXPO;
}

// Paleta de respaldo para tenants con varias salas del mismo tipo (evita dos
// series del mismo color en los gráficos).
export const SALA_FALLBACK_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-3)', 'var(--chart-5)', 'var(--chart-7)'];

export function salaSeriesColors(salas: Array<{ kind?: SalaKind; aforo?: number | null }>): string[] {
  const used = new Set<string>();
  return salas.map((s, i) => {
    let c = salaColor(s.kind ?? (s.aforo != null ? s.aforo : null)).c;
    if (used.has(c)) c = SALA_FALLBACK_COLORS.find((f) => !used.has(f)) ?? SALA_FALLBACK_COLORS[i % SALA_FALLBACK_COLORS.length]!;
    used.add(c);
    return c;
  });
}

// Relleno (con su texto) de los botones primarios de la puerta, AA verificado en
// DoorButton.test.tsx: marca = bg-brand + brand-fg (derivado por contraste en el tema);
// VR = info-text (azul secundario por defecto, secundario del tenant oscurecido a ≥4,5:1 con blanco).
export const DOOR_FILL = {
  brand: 'bg-brand text-brand-fg',
  vr: 'bg-info-text text-white',
} as const;
