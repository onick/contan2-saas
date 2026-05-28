// Contrato de breakpoints del producto v2 (mobile-first).
// Mapean a los defaults de Tailwind v4:
//   base (sin prefijo) = mobile  → BREAKPOINTS.mobile (375)
//   md:                = tablet  → BREAKPOINTS.tablet (768)
//   xl:                = desktop → BREAKPOINTS.desktop (1280)
//
// Fuente única para JS/tests que necesiten los valores numéricos (ej. el
// futuro smoke visual por viewport con Playwright). El CSS NO los redefine:
// usa los defaults de Tailwind, que ya coinciden con estos números.

export const BREAKPOINTS = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;
