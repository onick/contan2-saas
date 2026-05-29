import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import './globals.css';
import { getLocalBranding } from '../lib/branding/config';
import { brandingToCssVars } from '../lib/branding/theme';

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
    <html lang="es">
      <body style={themeVars}>{children}</body>
    </html>
  );
}
