import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Roboto_Mono } from 'next/font/google';

// Mono para el código/PIN y etiquetas (lectura mecánica, tipo terminal de puerta).
const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-roboto-mono', display: 'swap' });

// Layout del SCANNER · superficie de STAFF en puerta, fuera del shell admin (sin
// sidebar ni rutas internas). Mobile-first (el staff escanea desde el teléfono),
// tema oscuro para que el visor de cámara y el feedback de color resalten bajo
// cualquier luz. Sin filtraciones a rutas admin: es una página aislada.
export const metadata: Metadata = {
  title: 'Scanner · Centro Cultural Banreservas',
  description: 'Registro de entrada por escaneo de código',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // evita zoom accidental mientras se escanea
  themeColor: '#0b0e14',
};

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return (
    <main
      className={`relative min-h-dvh bg-[#0b0e14] text-[#f4f5f8] antialiased ${robotoMono.variable}`}
    >
      {children}
    </main>
  );
}
