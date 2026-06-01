import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Roboto_Mono } from 'next/font/google';

// Mono para eyebrows/fechas/etiquetas (parte del acabado tipo "instalación").
const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-roboto-mono', display: 'swap' });

// Layout del KIOSKO · superficie pública del visitante, separada del shell
// admin (sin sidebar ni rutas internas). Tema OSCURO institucional, full-screen,
// tablet-first. Fondo profundo con glows radiales cálidos (marca) + film grain
// sutil, igualando el nivel del kiosko v1. Sin fetch → la ruta se prerenderiza.
export const metadata: Metadata = {
  title: 'Registro · Centro Cultural Banreservas',
  description: 'Registra tu asistencia',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // kiosko: evita zoom accidental en tablet
  themeColor: '#0b0e14',
};

// Film grain decorativo (data-URI, sin red). Igual al de v1: fractalNoise tenue.
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")";

export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <main
      className={`relative min-h-dvh overflow-hidden text-[#f4f5f8] antialiased ${robotoMono.variable}`}
      style={{
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(255,111,0,0.07), transparent 55%),' +
          'radial-gradient(ellipse at 50% 100%, rgba(230,81,0,0.13), transparent 60%),' +
          '#0b0e14',
      }}
    >
      {/* Grain overlay (decorativo, no interactivo) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: '200px 200px' }}
      />
      <div className="relative z-10 min-h-dvh">{children}</div>
    </main>
  );
}
