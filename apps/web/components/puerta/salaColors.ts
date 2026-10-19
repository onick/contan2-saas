// components/puerta/salaColors.ts · identidad de color por sala permanente.
// SOLO decorativa (franja, eyebrow, íconos, dots): los CTA usan el kit (AA).
// VR (con aforo) = azul · exposición (ilimitada) = naranja.

export interface SalaColor { c: string; soft: string; deep: string }

export function salaColor(aforo: number | null): SalaColor {
  return aforo !== null
    ? { c: 'var(--chart-2)', soft: 'var(--color-info-soft)', deep: 'var(--color-info-text)' }
    : { c: 'var(--chart-1)', soft: 'var(--color-brand-soft)', deep: 'var(--color-brand-text)' };
}

// Paleta de respaldo para tenants con varias salas del mismo tipo (evita dos
// series del mismo color en los gráficos).
export const SALA_FALLBACK_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-3)', 'var(--chart-5)', 'var(--chart-7)'];

export function salaSeriesColors(salas: Array<{ aforo: number | null }>): string[] {
  const used = new Set<string>();
  return salas.map((s, i) => {
    let c = salaColor(s.aforo).c;
    if (used.has(c)) c = SALA_FALLBACK_COLORS.find((f) => !used.has(f)) ?? SALA_FALLBACK_COLORS[i % SALA_FALLBACK_COLORS.length]!;
    used.add(c);
    return c;
  });
}
