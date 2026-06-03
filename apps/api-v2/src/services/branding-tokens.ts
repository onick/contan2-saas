// apps/api-v2/src/services/branding-tokens.ts · tokens de marca para la
// credencial PNG. Port PURO (sin deps) del algoritmo de v1
// (backend/src/utils/palette.js + emailBranding.resolveBrandingTokens): deriva
// una paleta HSL desde el primaryColor del tenant y elige colores de contraste.
// Mantener en paridad con v1 para que la credencial v2 se vea idéntica.

export interface OrgBranding {
  name: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface BrandingTokens {
  primary: string;
  primaryMid: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  onPrimary: string;
  onAccent: string;
  orgName: string;
}

interface Hsl { h: number; s: number; l: number }

function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return null;
  const r = parseInt(m[1]!, 16) / 255;
  const g = parseInt(m[2]!, 16) / 255;
  const b = parseInt(m[3]!, 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function luminance(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return 0;
  const channel = (c: string) => {
    const x = parseInt(c, 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(m[1]!) + 0.7152 * channel(m[2]!) + 0.0722 * channel(m[3]!);
}

/** Color de texto de contraste sobre `hex` (gris oscuro o blanco). */
export function pickOn(hex: string): string {
  return luminance(hex) > 0.5 ? '#1f2937' : '#ffffff';
}

/** Paleta 50..900 desde un hex (mismo algoritmo HSL que v1). null si hex inválido. */
export function generatePalette(hex: string): Record<string, string> | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const s = Math.max(35, Math.min(85, hsl.s));
  const stops: Array<[string, number]> = [
    ['400', 55], ['500', 45], ['700', 28], ['900', 14],
  ];
  const palette: Record<string, string> = {};
  for (const [name, l] of stops) palette[name] = hslToHex(hsl.h, s, l);
  return palette;
}

// Resuelve los tokens que consume la credencial. Defaults seguros (CCB legacy)
// si la org no trae colores. Paridad con v1 resolveBrandingTokens.
export function resolveBrandingTokens(org: OrgBranding | null): BrandingTokens {
  const primary = org?.primaryColor || '#1a237e';
  const accent = org?.secondaryColor || '#ff6f00';
  const palette = generatePalette(primary) || {};
  const primaryMid = palette['500'] || '#3949ab';
  const primaryLight = palette['400'] || '#534bae';
  const accentLight = '#ffa040';
  const onPrimary = pickOn(palette['700'] || primary);
  const onAccent = pickOn(accent);
  return {
    primary, primaryMid, primaryLight,
    accent, accentLight,
    onPrimary, onAccent,
    orgName: org?.name || 'contan2-saas',
  };
}
