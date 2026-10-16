// apps/web/lib/marketing/landing-font.ts · fuente de la landing aprobada en el
// mockup (2026-10-16): Schibsted Grotesk, única familia, variable 400–800,
// subconjunto latin (≈47 KB, un solo woff2). Sin itálica.
//
// `variable` expone --font-landing para el CSS. (Antes convivía con fonts.ts/Fraunces,
// que se eliminó junto con SignupModal.)
import { Schibsted_Grotesk } from 'next/font/google';

export const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-landing',
  adjustFontFallback: true,
});
