// apps/web/lib/branding/contrast.ts · contraste WCAG para el editor de identidad.
// Decide el color de texto sobre un fondo de marca: blanco si cumple AA (4.5:1),
// si no un ink OSCURO (caso #f39228: blanco da 2.35:1 → falla → texto oscuro). Puro,
// sin DOM. Sólo opera con hex #RRGGBB válidos (el editor valida antes de llamar).

const INK = '#1f2326'; // ink oscuro de marca para fondos claros (alto contraste)

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

// Texto AA-safe sobre un fondo de marca. Blanco si ≥4.5:1; INK si ≥4.5:1; negro
// puro como último recurso para tonos medios donde ningún extremo llega solo.
export function textOn(bgHex: string): TextOnResult {
  const whiteRatio = contrastRatio('#ffffff', bgHex);
  if (whiteRatio >= 4.5) return { color: '#ffffff', isDark: false, ratio: whiteRatio, whiteRatio };
  const inkRatio = contrastRatio(INK, bgHex);
  if (inkRatio >= 4.5) return { color: INK, isDark: true, ratio: inkRatio, whiteRatio };
  const blackRatio = contrastRatio('#000000', bgHex);
  return { color: '#000000', isDark: true, ratio: blackRatio, whiteRatio };
}

export const isHex6 = (s: string): boolean => /^#[0-9a-fA-F]{6}$/.test(s);

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => clampByte(x).toString(16).padStart(2, '0')).join('')}`;

// Oscurece hex en pasos finos (~1-2% L en HSL) hasta alcanzar `min` de contraste
// contra `bg`; conserva tono y saturación. Hex inválido → fallback naranja oscuro.
export function textShade(hex: string, bg = '#ffffff', min = 4.5): string {
  if (!isHex6(hex)) return '#b45f0a';
  if (contrastRatio(hex, bg) >= min) return hex;
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  // Convertir a HSL para oscurecer sólo L y preservar tono+saturación.
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min2 = Math.min(rn, gn, bn);
  let hh = 0, ss = 0;
  const ll = (max + min2) / 2;
  if (max !== min2) {
    const d = max - min2;
    ss = ll > 0.5 ? d / (2 - max - min2) : d / (max + min2);
    if (max === rn) hh = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) hh = ((bn - rn) / d + 2) / 6;
    else hh = ((rn - gn) / d + 4) / 6;
  }
  const hsl2rgb = (p: number, q: number, t: number) => {
    const tt = ((t % 1) + 1) % 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let lCur = ll;
  for (let i = 0; i < 200 && contrastRatio(toHex(r, g, b), bg) < min; i++) {
    lCur = Math.max(0, lCur - 0.005);
    const q = lCur < 0.5 ? lCur * (1 + ss) : lCur + ss - lCur * ss;
    const p = 2 * lCur - q;
    r = Math.round(hsl2rgb(p, q, hh + 1 / 3) * 255);
    g = Math.round(hsl2rgb(p, q, hh) * 255);
    b = Math.round(hsl2rgb(p, q, hh - 1 / 3) * 255);
  }
  return toHex(r, g, b);
}

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
