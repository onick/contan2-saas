import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { Roboto_Flex } from 'next/font/google';
import './globals.css';
import { getLocalBranding } from '../lib/branding/config';
import { getBranding } from '../lib/api/branding';
import { brandingToCssVars } from '../lib/branding/theme';

// Tipografía estilo Google/Material: Roboto Flex. next/font self-hostea la
// fuente en build (sin dep nueva; built-in de Next) y expone la CSS var que
// globals.css mapea a --font-sans de Tailwind.
const robotoFlex = Roboto_Flex({ subsets: ['latin'], variable: '--font-roboto-flex', display: 'swap' });

export const metadata: Metadata = {
  title: 'Contan2 v2',
  description: 'contan2 · plataforma v2 · skeleton responsive',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Theming por tenant desde UNA sola fuente: branding real de
  // GET /api/v2/org/branding (read-only) si hay sesión; si no, branding local
  // (fallback en dev). Misma forma (BrandingOrg = OrgBrandingResponse.
  // organization) → brandingToCssVars sobreescribe --color-brand(-accent) en
  // <body> y re-tematiza todo el subtree, sin mezclar real/local.
  // ATENCIÓN: este layout es la raíz y toca cookies()/fetch → vuelve DINÁMICO
  // todo el árbol (todas las rutas pasan a ƒ). Es el costo de tematizar por
  // tenant desde el root.
  const branding = (await getBranding()) ?? getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;

  return (
    <html lang="es" className={robotoFlex.variable}>
      <body style={themeVars} className="font-sans">
        {children}
      </body>
    </html>
  );
}
