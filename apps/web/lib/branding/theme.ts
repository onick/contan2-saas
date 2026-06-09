import type { OrgBrandingResponse } from '@contan2/contracts';

// Reutilizamos el tipo del contrato SIN redefinirlo: el branding que consume
// apps/web es exactamente `OrgBrandingResponse['organization']`. Así el mock
// local de hoy y la respuesta real de GET /api/v2/org/branding comparten una
// sola forma.
export type BrandingOrg = OrgBrandingResponse['organization'];

// Nombres de las CSS custom properties que el theming sobreescribe. Coinciden
// con los tokens declarados en `@theme` (globals.css), de modo que las
// utilidades de Tailwind (bg-brand, text-brand, …) — que resuelven
// var(--color-brand) — quedan re-tematizadas al aplicar este mapa en un
// ancestro.
import { strongFill } from './contrast';

export const CSS_VAR_BRAND = '--color-brand';
export const CSS_VAR_BRAND_ACCENT = '--color-brand-accent';
// --color-brand-strong: relleno con texto blanco (botones/badges). Se DERIVA del
// primario del tenant de forma AA-safe (ver strongFill) → al guardar un primario
// claro (#f39228) los botones se oscurecen lo justo para cumplir AA, en vez de
// quedar fijos en el default. Antes no se tematizaba por tenant.
export const CSS_VAR_BRAND_STRONG = '--color-brand-strong';

export type BrandCssVars = {
  [CSS_VAR_BRAND]: string;
  [CSS_VAR_BRAND_ACCENT]: string;
  [CSS_VAR_BRAND_STRONG]: string;
};

// Función PURA: branding → mapa de CSS vars. Se aplica como `style` inline en
// un ancestro (ver app/layout.tsx). No toca el DOM ni la red.
//
// Wiring futuro (otro PR): un Server Component hará
//   const data = OrgBrandingResponseSchema.parse(await res.json());
//   const vars = brandingToCssVars(data.organization);
// y aplicará `vars` igual que hoy. El puente CSS-var no cambia; solo cambia
// de dónde sale `data.organization`.
export function brandingToCssVars(branding: BrandingOrg): BrandCssVars {
  return {
    [CSS_VAR_BRAND]: branding.primaryColor,
    [CSS_VAR_BRAND_ACCENT]: branding.secondaryColor,
    [CSS_VAR_BRAND_STRONG]: strongFill(branding.primaryColor),
  };
}
