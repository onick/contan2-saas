import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Layout del KIOSKO · superficie pública del visitante, separada del shell
// admin (no hay sidebar ni rutas internas). Tema OSCURO institucional,
// full-screen, tablet-first. Cubre el fondo claro del root con un wrapper que
// ocupa el viewport (h-dvh). Sin fetch → la ruta puede prerenderizarse.
export const metadata: Metadata = {
  title: 'Registro · Centro Cultural Banreservas',
  description: 'Registra tu asistencia',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // kiosko: evita zoom accidental en tablet
  themeColor: '#0e0f14',
};

export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#0e0f14] text-[#f4f5f8] antialiased">{children}</main>
  );
}
