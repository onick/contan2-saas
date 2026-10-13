import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Contan2 v2',
  description: 'contan2 · plataforma v2 · skeleton responsive',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // El teclado virtual ENCOGE el viewport (no lo tapa): los formularios en drawer
  // (check-in "Crear y registrar", scanner manual, login) mantienen sus botones de
  // acción visibles encima del teclado en tablet/móvil, sin scroll. dvh se reajusta.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Root ESTÁTICO: solo HTML + fuente base. El theming por-tenant (cookies()/
  // fetch) vive en app/app/layout.tsx, de modo que la marketing `/` y
  // `/_not-found` no tocan red y pueden prerenderizarse (Static). El <body> usa
  // los defaults de @theme (paleta CCB) hasta que el subtree /app aplique el
  // branding real del tenant.
  return (
    <html lang="es" className={`${inter.variable} ${ibmPlexMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
