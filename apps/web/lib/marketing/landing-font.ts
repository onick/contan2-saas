// apps/web/lib/marketing/landing-font.ts · fuente de la landing aprobada en el
// mockup (2026-10-16): Schibsted Grotesk, única familia, variable 400–800,
// subconjunto latin (≈47 KB, un solo woff2). Sin itálica.
//
// Vive APARTE de fonts.ts a propósito: next/font precarga toda fuente que
// importe el módulo de la página, y fonts.ts también define Fraunces (la usa
// SignupModal). Importar ambas desde la landing precargaba 2 woff2 (83 KB) y
// rompía el presupuesto (≤80 KB). `variable` expone --font-landing para el CSS.
import { Schibsted_Grotesk } from 'next/font/google';

export const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-landing',
  adjustFontFallback: true,
});
