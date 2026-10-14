import type { Metadata, Viewport } from 'next';
import type { ReactNode, CSSProperties } from 'react';
import { getPublicBranding } from '../../lib/api/kiosko';
import { getLocalBranding } from '../../lib/branding/config';
import { brandingToCssVars } from '../../lib/branding/theme';

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicBranding();
  return {
    title: branding?.name ? `Registro · ${branding.name}` : 'Registro',
    description: 'Registra tu asistencia',
    ...(branding?.logoUrl ? { icons: { icon: branding.logoUrl } } : {}),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#fafaf9',
};

export default async function KioskLayout({ children }: { children: ReactNode }) {
  const local = getLocalBranding();
  const pub = await getPublicBranding();
  const base = pub
    ? { ...local, primaryColor: pub.primaryColor, secondaryColor: pub.secondaryColor }
    : local;
  const cssVars = brandingToCssVars(base) as CSSProperties;

  return (
    <main
      style={{
        ...cssVars,
        background: 'linear-gradient(180deg, var(--color-brand-soft), var(--color-page) 55%)',
      }}
      className="relative min-h-dvh overflow-x-hidden text-ink antialiased bg-brand-soft"
    >
      {children}
    </main>
  );
}
