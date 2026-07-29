// components/puerta/salaColors.ts · identidad de color por sala permanente.
// SOLO decorativa (franja, eyebrow, íconos, dots): los CTA usan el kit (AA).
// VR (con aforo) = azul · exposición (ilimitada) = naranja.

export interface SalaColor { c: string; soft: string; deep: string }

export function salaColor(aforo: number | null): SalaColor {
  return aforo !== null
    ? { c: '#2f9fd6', soft: '#e7f3fb', deep: '#1a6194' }
    : { c: '#ee8c27', soft: '#fdf2e5', deep: '#c9701a' };
}

// Paleta de respaldo para tenants con varias salas del mismo tipo (evita dos
// series del mismo color en los gráficos).
export const SALA_FALLBACK_COLORS = ['#ee8c27', '#2f9fd6', '#8b5cf6', '#14b8a6', '#ec4899', '#3b6fe0'];

export function salaSeriesColors(salas: Array<{ aforo: number | null }>): string[] {
  const used = new Set<string>();
  return salas.map((s, i) => {
    let c = salaColor(s.aforo).c;
    if (used.has(c)) c = SALA_FALLBACK_COLORS.find((f) => !used.has(f)) ?? SALA_FALLBACK_COLORS[i % SALA_FALLBACK_COLORS.length]!;
    used.add(c);
    return c;
  });
}
