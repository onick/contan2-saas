// apps/web/lib/branding/contrast.ts · contraste WCAG para el editor de identidad.
// Decide el color de texto sobre un fondo de marca: blanco si cumple AA (4.5:1),
// si no un ink OSCURO (caso #f39228: blanco da 2.35:1 → falla → texto oscuro). Puro,
// sin DOM. Sólo opera con hex #RRGGBB válidos (el editor valida antes de llamar).

const INK = '#1c1206'; // ink oscuro de marca para fondos claros (alto contraste)

function channelLin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const la = luminance(hexA);
  const lb = luminance(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export interface TextOnResult {
  color: string; // color de texto AA-safe sobre el fondo
  isDark: boolean; // true si se eligió texto oscuro (fondo claro tipo #f39228)
  ratio: number; // contraste del color elegido vs el fondo
  whiteRatio: number; // contraste de BLANCO vs el fondo (para mostrar el aviso)
}

// Texto AA-safe sobre un fondo de marca. Blanco si ≥4.5:1; si no, ink oscuro.
export function textOn(bgHex: string): TextOnResult {
  const whiteRatio = contrastRatio('#ffffff', bgHex);
  if (whiteRatio >= 4.5) return { color: '#ffffff', isDark: false, ratio: whiteRatio, whiteRatio };
  const inkRatio = contrastRatio(INK, bgHex);
  return { color: INK, isDark: true, ratio: inkRatio, whiteRatio };
}

export const isHex6 = (s: string): boolean => /^#[0-9a-fA-F]{6}$/.test(s);

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => clampByte(x).toString(16).padStart(2, '0')).join('')}`;

// Relleno de marca AA-safe para texto BLANCO (≥4.5:1): devuelve el primario si ya
// cumple, si no una versión oscurecida que sí cumple (caso #f39228 → blanco 2.35:1
// → se oscurece). Sirve para derivar --color-brand-strong por tenant sin romper AA.
// Fallback seguro al brand-strong por defecto si el hex es inválido.
export function strongFill(primaryHex: string): string {
  if (!isHex6(primaryHex)) return '#c44400';
  if (contrastRatio('#ffffff', primaryHex) >= 4.5) return primaryHex;
  const h = primaryHex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  for (let i = 0; i < 24 && contrastRatio('#ffffff', toHex(r, g, b)) < 4.5; i++) {
    r *= 0.9; g *= 0.9; b *= 0.9;
  }
  return toHex(r, g, b);
}
