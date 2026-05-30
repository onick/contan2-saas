import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { getLocalBranding } from '../lib/branding/config';
import { brandingToCssVars } from '../lib/branding/theme';

// Tipografía Vercel-style: Geist Sans (texto) + Geist Mono (números). next/font
// self-hostea las fuentes en build (sin dep nueva; built-in de Next). Exponen
// CSS vars que globals.css mapea a --font-sans / --font-mono de Tailwind.
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Contan2 v2',
  description: 'contan2 · plataforma v2 · skeleton responsive',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Theming por tenant: sobreescribimos las CSS vars de @theme en <body> con el
  // branding LOCAL. Las utilidades de Tailwind (bg-brand, text-brand, …)
  // resuelven estas vars, así que re-tematizan todo el subtree. Hoy la fuente
  // es config local (estático); el wiring a /api/v2/org/branding cambia solo
  // la fuente, no este puente. Resolución host → slug llega en ese PR.
  const branding = getLocalBranding();
  const themeVars = brandingToCssVars(branding) as CSSProperties;

  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body style={themeVars} className="font-sans">
        {children}
      </body>
    </html>
  );
}
