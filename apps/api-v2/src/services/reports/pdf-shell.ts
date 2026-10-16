// apps/api-v2/src/services/reports/pdf-shell.ts · cáscara COMPARTIDA de los
// informes PDF (período, actividad y asistencia por actividad/ciclo): tema de
// marca del tenant, CSS base (portada naranja con logo en tarjeta blanca, KPIs
// en tarjetas, títulos de sección, tags) y HTML de portada. Un solo lugar =
// los tres PDF se ven como el mismo producto.

import { generatePalette, pickOn } from '../branding-tokens.js';

export const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface PdfThemeOrg {
  slug?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

export interface PdfTheme {
  structural: string; // títulos de sección, encabezados de tabla
  primary: string;
  primaryLight: string;
  primary100: string;
  primary900: string;
  accent: string;
  headerA: string; // portada: naranja de marca limpio
  headerB: string;
  onStructural: string;
  onAccent: string;
}

/** Tema del PDF a partir del branding del tenant (idéntico para todos los informes). */
export function pdfTheme(org: PdfThemeOrg): PdfTheme {
  const palette = (generatePalette(org.primaryColor || '#f39228') ?? {}) as Record<string, string>;
  const primary = palette['700'] || org.primaryColor || '#f39228';
  const accent = org.secondaryColor || '#31a3db';
  // Color ESTRUCTURAL: azul profundo de la identidad del CCB; primary derivado en el resto.
  const structural = org.slug === 'ccb' ? '#1a6194' : primary;
  return {
    structural,
    primary,
    primaryLight: palette['50'] || '#fef4e8',
    primary100: palette['100'] || '#fde6c8',
    primary900: palette['900'] || '#7a3300',
    accent,
    headerA: org.primaryColor || primary,
    headerB: palette['800'] || palette['900'] || org.primaryColor || '#7a3300',
    onStructural: pickOn(structural),
    onAccent: pickOn(accent),
  };
}

/** CSS base común a los tres PDF. Cada plantilla agrega el suyo debajo. */
export function pdfShellCss(t: PdfTheme): string {
  return `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  :root {
    --primary: ${t.structural};
    --primary-light: ${t.primaryLight};
    --primary-100: ${t.primary100};
    --primary-900: ${t.primary900};
    --accent: ${t.accent};
    --accent-light: #fff4e6;
    --header-a: ${t.headerA};
    --header-b: ${t.headerB};
    --on-primary: ${t.onStructural};
    --on-accent: ${t.onAccent};
    --text: #1f2937;
    --text-muted: #6b7280;
    --border: #e5e7eb;
    --surface: #ffffff;
    --surface-alt: #f9fafb;
  }
  html, body { font-family: 'Inter', system-ui, sans-serif; color: var(--text); margin: 0; font-size: 11px; line-height: 1.45; }
  h1, h2, h3 { margin: 0; font-weight: 700; color: var(--text); }
  .muted { color: var(--text-muted); font-size: 9px; margin-top: 2px; }

  /* Portada · banda de marca limpia (naranja), logo en tarjeta blanca. */
  .cover { position: relative; padding: 30px 34px; background: linear-gradient(115deg, var(--header-a) 0%, var(--header-a) 42%, var(--header-b) 100%); color: #ffffff; border-radius: 16px; overflow: hidden; }
  .cover::after { content: ''; position: absolute; right: -120px; top: -140px; width: 360px; height: 360px; background: radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 70%); border-radius: 50%; }
  .cover-head { display: flex; align-items: center; gap: 18px; position: relative; z-index: 1; }
  .cover-logo { background: #ffffff; border-radius: 13px; padding: 9px 14px; display: flex; align-items: center; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,0,0,0.14); }
  .cover-logo img { height: 46px; width: auto; max-width: 150px; object-fit: contain; display: block; }
  .cover-org { font-size: 10.5px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: rgba(255,255,255,0.92); }
  .cover-eyebrow { margin-top: 6px; font-size: 9.5px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(255,255,255,0.8); }
  .cover-title { font-size: 27px; font-weight: 800; line-height: 1.12; margin-top: 3px; letter-spacing: -0.3px; color: #ffffff; }
  .cover-meta { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 20px; position: relative; z-index: 1; gap: 16px; }
  .cover-range { font-size: 15px; font-weight: 800; color: #ffffff; }
  .cover-subtitle { font-size: 10.5px; color: rgba(255,255,255,0.82); }
  .cover-pill { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #ffffff; background: rgba(255,255,255,0.16); padding: 5px 12px; border-radius: 999px; }

  /* KPIs · tarjetas limpias, número de marca. */
  .kpis { margin-top: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; }
  .kpis--4 { grid-template-columns: repeat(4, 1fr); }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 15px 16px 14px; }
  .kpi-label { font-size: 9.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
  .kpi-value { font-size: 27px; font-weight: 800; color: var(--text); line-height: 1; margin-top: 6px; letter-spacing: -0.5px; }
  .kpi.accent .kpi-value { color: var(--accent); }
  .kpi-sub { font-size: 9.5px; color: var(--text-muted); margin-top: 3px; }

  .section { margin-top: 22px; }
  .section h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: var(--primary); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid var(--primary); display: inline-block; }

  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
  .tag--ok { background: rgba(16,185,129,0.14); color: #047857; }
  .tag--danger { background: rgba(239,68,68,0.14); color: #b91c1c; }
  .tag--muted { background: #e5e7eb; color: #374151; }

  .page-break { page-break-before: always; }
  .footnote { margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 9px; color: var(--text-muted); font-style: italic; }
  .empty { text-align: center; padding: 24px; color: var(--text-muted); font-style: italic; }
`;
}

export interface PdfCoverInput {
  logo: string | null;
  orgName: string;
  title: string; // ya escapado si lleva HTML; se inserta tal cual
  eyebrow?: string;
  range: string;
  subtitle: string;
  pill?: string;
}

/** Portada común: marca del tenant, título, rango y "Generado el …". */
export function pdfCover(c: PdfCoverInput): string {
  return `<section class="cover">
  <div class="cover-head">
    ${c.logo ? `<div class="cover-logo"><img src="${c.logo}" alt="" /></div>` : ''}
    <div>
      <div class="cover-org">${esc(c.orgName)}</div>
      ${c.eyebrow ? `<div class="cover-eyebrow">${c.eyebrow}</div>` : ''}
      <div class="cover-title">${c.title}</div>
    </div>
  </div>
  <div class="cover-meta">
    <div>
      <div class="cover-range">${esc(c.range)}</div>
      <div class="cover-subtitle">${esc(c.subtitle)}</div>
    </div>
    <div class="cover-pill">${esc(c.pill ?? 'Reporte oficial')}</div>
  </div>
</section>`;
}
