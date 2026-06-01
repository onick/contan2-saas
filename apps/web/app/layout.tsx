import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Roboto_Flex } from 'next/font/google';
import './globals.css';

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

export default function RootLayout({ children }: { children: ReactNode }) {
  // Root ESTÁTICO: solo HTML + fuente base. El theming por-tenant (cookies()/
  // fetch) vive en app/app/layout.tsx, de modo que la marketing `/` y
  // `/_not-found` no tocan red y pueden prerenderizarse (Static). El <body> usa
  // los defaults de @theme (paleta CCB) hasta que el subtree /app aplique el
  // branding real del tenant.
  return (
    <html lang="es" className={robotoFlex.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
