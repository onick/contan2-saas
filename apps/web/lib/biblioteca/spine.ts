// Paleta de lomos para portadas sin imagen — derivada de tokens de diseño.
// Todos los colores tienen contraste ≥ 4.5:1 con texto blanco.
export const SPINE_TOKENS = [
  'var(--color-info-text)',   // #1d7aa7
  'var(--color-success-fg)', // #15803d
  'var(--color-danger-fg)',  // #b91c1c
  'var(--color-warning-fg)', // #b45f0a
  'var(--color-brand-text)', // #ae5f0a
  'var(--color-muted)',      // #636769
  'var(--color-ink)',        // #1f2326
];

export function spineColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return SPINE_TOKENS[h % SPINE_TOKENS.length]!;
}
