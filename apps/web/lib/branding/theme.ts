import type { OrgBrandingResponse } from '@contan2/contracts';

// BrandingOrg reutiliza el tipo del contrato para mantener sincronía automática con la API.
export type BrandingOrg = OrgBrandingResponse['organization'];

import { deriveBrandTokens, textShade } from './contrast';

export const CSS_VAR_BRAND        = '--color-brand';
export const CSS_VAR_BRAND_FG     = '--color-brand-fg';
export const CSS_VAR_BRAND_TEXT   = '--color-brand-text';
export const CSS_VAR_BRAND_SOFT   = '--color-brand-soft';
export const CSS_VAR_BRAND_ACCENT = '--color-brand-accent';
export const CSS_VAR_INFO_TEXT    = '--color-info-text';
export const CSS_VAR_INFO_SOFT    = '--color-info-soft';
export const CSS_VAR_FOCUS        = '--color-focus';
// Relleno oscuro de marca (CTAs con texto blanco): más oscuro que brand-text.
export const CSS_VAR_BRAND_STRONG = '--color-brand-strong';
// Gráficas: serie principal = marca; serie 2 = secundario a ≥3:1 (como el foco).
export const CSS_VAR_CHART_1      = '--chart-1';
export const CSS_VAR_CHART_2      = '--chart-2';
// Tarjeta protagonista oscura del Inicio: secundario del tenant oscurecido a >=7:1 con texto blanco.
export const CSS_VAR_ACCENT_STRONG    = '--color-accent-strong';
export const CSS_VAR_ACCENT_STRONG_FG = '--color-accent-strong-fg';

export type BrandCssVars = {
  [CSS_VAR_BRAND]:        string;
  [CSS_VAR_BRAND_FG]:     string;
  [CSS_VAR_BRAND_TEXT]:   string;
  [CSS_VAR_BRAND_SOFT]:   string;
  [CSS_VAR_BRAND_ACCENT]: string;
  [CSS_VAR_INFO_TEXT]:    string;
  [CSS_VAR_INFO_SOFT]:    string;
  [CSS_VAR_FOCUS]:        string;
  [CSS_VAR_BRAND_STRONG]: string;
  [CSS_VAR_CHART_1]:      string;
  [CSS_VAR_CHART_2]:      string;
  [CSS_VAR_ACCENT_STRONG]:    string;
  [CSS_VAR_ACCENT_STRONG_FG]: string;
};

// Los alias var() dentro de @theme se resuelven en :root y no siguen al tenant
// aplicado en el <div> de app/app/layout.tsx → emitimos todos los valores derivados
// como vars concretas para que el subtree quede completamente tematizado.
export function brandingToCssVars(branding: BrandingOrg): BrandCssVars {
  const secondary = branding.secondaryColor;
  const t = deriveBrandTokens(branding.primaryColor);
  // bg='#fafaf9' (page) es ligeramente más difícil que blanco → garantiza ≥4.5 en ambos.
  const infoText  = textShade(secondary, '#fafaf9');
  // Anillo de foco: del color SECUNDARIO del tenant (CCB: azul #31a3db), oscurecido hasta
  // ≥3:1 sobre blanco (WCAG 1.4.11). Sin secundario válido cae a brand-strong (como antes).
  const focus     = /^#[0-9a-f]{6}$/i.test(secondary) ? textShade(secondary, '#ffffff', 3) : t.focus;
  // Azul profundo fijo (#14465f, ~10:1 con blanco) si el secundario no es un hex valido.
  const accentStrong = /^#[0-9a-f]{6}$/i.test(secondary) ? textShade(secondary, '#ffffff', 7) : '#14465f';
  return {
    [CSS_VAR_BRAND]:        t.brand,
    [CSS_VAR_BRAND_FG]:     t.brandFg,
    [CSS_VAR_BRAND_TEXT]:   t.brandText,
    [CSS_VAR_BRAND_SOFT]:   t.brandSoft,
    [CSS_VAR_BRAND_ACCENT]: secondary,
    [CSS_VAR_INFO_TEXT]:    infoText,
    [CSS_VAR_INFO_SOFT]:    `color-mix(in srgb, ${secondary} 10%, white)`,
    [CSS_VAR_FOCUS]:        focus,
    [CSS_VAR_BRAND_STRONG]: t.brandStrong,
    [CSS_VAR_CHART_1]:      t.brand,
    [CSS_VAR_CHART_2]:      focus,
    [CSS_VAR_ACCENT_STRONG]:    accentStrong,
    [CSS_VAR_ACCENT_STRONG_FG]: '#ffffff',
  };
}
