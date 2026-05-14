// Genera paleta primaria (50..900) desde un único hex usando HSL.
// Mismo algoritmo que branding.js en el frontend — mantienelos en sync.

const STOPS = [
  { name: '50',  l: 96 },
  { name: '100', l: 90 },
  { name: '200', l: 80 },
  { name: '300', l: 68 },
  { name: '400', l: 55 },
  { name: '500', l: 45 },
  { name: '600', l: 36 },
  { name: '700', l: 28 },
  { name: '800', l: 20 },
  { name: '900', l: 14 },
];

function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
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
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function luminance(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return 0;
  const channel = c => {
    c = parseInt(c, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(m[1]) + 0.7152 * channel(m[2]) + 0.0722 * channel(m[3]);
}

export function pickOn(hex) {
  return luminance(hex) > 0.5 ? '#1f2937' : '#ffffff';
}

export function generatePalette(hex) {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const s = Math.max(35, Math.min(85, hsl.s));
  const palette = {};
  for (const stop of STOPS) {
    palette[stop.name] = hslToHex(hsl.h, s, stop.l);
  }
  return palette;
}

function sidebarVars(style) {
  if (style === 'light') {
    return [
      '--color-sidebar-bg-from:#ffffff',
      '--color-sidebar-bg-to:#f4f6fa',
      '--color-sidebar-text:#1f2937',
      '--color-sidebar-text-muted:#6b7280',
      '--color-sidebar-hover-bg:rgba(15,23,42,0.06)',
      '--color-sidebar-border:rgba(15,23,42,0.08)',
    ];
  }
  if (style === 'dark') {
    return [
      '--color-sidebar-bg-from:#111827',
      '--color-sidebar-bg-to:#0b1220',
      '--color-sidebar-text:#ffffff',
      '--color-sidebar-text-muted:rgba(255,255,255,0.6)',
      '--color-sidebar-hover-bg:rgba(255,255,255,0.08)',
      '--color-sidebar-border:rgba(255,255,255,0.08)',
    ];
  }
  // brand (default)
  return [
    '--color-sidebar-bg-from:var(--color-primary-700)',
    '--color-sidebar-bg-to:var(--color-primary-900)',
    '--color-sidebar-text:var(--color-on-primary)',
    '--color-sidebar-text-muted:rgba(255,255,255,0.6)',
    '--color-sidebar-hover-bg:rgba(255,255,255,0.08)',
    '--color-sidebar-border:rgba(255,255,255,0.1)',
  ];
}

// Construye el bloque <style> que el server inyecta en el HTML inicial
// para evitar FOUC. branding.js puede revalidar y reaplicar después.
export function buildBrandingStyle(org) {
  if (!org || !org.primaryColor) return '';
  const palette = generatePalette(org.primaryColor);
  if (!palette) return '';
  const onPrimary = pickOn(palette['700']);
  const accent = org.secondaryColor || null;
  const onAccent = accent ? pickOn(accent) : null;
  const sidebarStyle = org.sidebarStyle || 'brand';

  const decls = [];
  for (const [stop, hex] of Object.entries(palette)) {
    decls.push(`--color-primary-${stop}:${hex}`);
    decls.push(`--k-primary-${stop}:${hex}`);
  }
  decls.push(`--color-primary:${org.primaryColor}`, `--k-primary:${org.primaryColor}`);
  decls.push(`--color-on-primary:${onPrimary}`, `--k-on-primary:${onPrimary}`);
  if (accent) {
    decls.push(`--color-accent:${accent}`, `--k-accent:${accent}`);
    decls.push(`--color-on-accent:${onAccent}`, `--k-on-accent:${onAccent}`);
  }
  decls.push(...sidebarVars(sidebarStyle));

  return `<style data-branding-ssr>:root{${decls.join(';')}}</style>`;
}
