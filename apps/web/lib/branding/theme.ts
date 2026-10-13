import type { OrgBrandingResponse } from '@contan2/contracts';

// BrandingOrg reutiliza el tipo del contrato para mantener sincronía automática con la API.
export type BrandingOrg = OrgBrandingResponse['organization'];

import { textOn, textShade } from './contrast';

export const CSS_VAR_BRAND        = '--color-brand';
export const CSS_VAR_BRAND_FG     = '--color-brand-fg';
export const CSS_VAR_BRAND_TEXT   = '--color-brand-text';
export const CSS_VAR_BRAND_SOFT   = '--color-brand-soft';
export const CSS_VAR_BRAND_ACCENT = '--color-brand-accent';
export const CSS_VAR_INFO_TEXT    = '--color-info-text';
export const CSS_VAR_INFO_SOFT    = '--color-info-soft';
export const CSS_VAR_FOCUS        = '--color-focus';
// Alias obsoleto — se conserva para no romper los ~19 consumidores actuales.
export const CSS_VAR_BRAND_STRONG = '--color-brand-strong';

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
};

// Los alias var() dentro de @theme se resuelven en :root y no siguen al tenant
// aplicado en el <div> de app/app/layout.tsx → emitimos todos los valores derivados
// como vars concretas para que el subtree quede completamente tematizado.
export function brandingToCssVars(branding: BrandingOrg): BrandCssVars {
  const primary   = branding.primaryColor;
  const secondary = branding.secondaryColor;
  // bg='#fafaf9' (page) es ligeramente más difícil que blanco → garantiza ≥4.5 en ambos.
  const brandText = textShade(primary, '#fafaf9');
  const infoText  = textShade(secondary, '#fafaf9');
  return {
    [CSS_VAR_BRAND]:        primary,
    [CSS_VAR_BRAND_FG]:     textOn(primary).color,
    [CSS_VAR_BRAND_TEXT]:   brandText,
    [CSS_VAR_BRAND_SOFT]:   `color-mix(in srgb, ${primary} 10%, white)`,
    [CSS_VAR_BRAND_ACCENT]: secondary,
    [CSS_VAR_INFO_TEXT]:    infoText,
    [CSS_VAR_INFO_SOFT]:    `color-mix(in srgb, ${secondary} 10%, white)`,
    [CSS_VAR_FOCUS]:        brandText,
    [CSS_VAR_BRAND_STRONG]: brandText,
  };
}
