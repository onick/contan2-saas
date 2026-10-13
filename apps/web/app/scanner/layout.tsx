import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { getPublicBranding } from '../../lib/api/kiosko';

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicBranding();
  return {
    title: branding?.name ? `Scanner · ${branding.name}` : 'Scanner',
    description: 'Registro de entrada por escaneo de código',
    robots: { index: false, follow: false },
    ...(branding?.logoUrl ? { icons: { icon: branding.logoUrl } } : {}),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // evita zoom accidental mientras se escanea
  themeColor: '#0b0e14',
};

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative min-h-dvh bg-[#0b0e14] text-[#f4f5f8] antialiased"
    >
      {children}
    </main>
  );
}
