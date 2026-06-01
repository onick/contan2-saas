import type { ReactNode } from 'react';
import type { BrandingOrg } from '../../lib/branding/theme';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export interface AppShellProps {
  branding: BrandingOrg;
  title: string;
  // key del ítem de navegación activo (según la ruta).
  activeKey?: string;
  // Chip de contexto opcional en el Topbar (ej. período).
  meta?: string;
  children: ReactNode;
}

// Estructura base del tenant-admin: Sidebar + (Topbar + main).
//   base (mobile 375): columna única, Sidebar oculto, brand en el Topbar.
//   md   (tablet 768): grid de 2 columnas, sidebar ~15rem.
//   xl   (desktop 1280): sidebar 16rem + main amplio.
// `minmax(0,1fr)` en la columna de contenido evita overflow horizontal.
// Server Component (sin estado): el home y esta ruta permanecen estáticos.
export function AppShell({ branding, title, activeKey, meta, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-page md:grid md:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_minmax(0,1fr)]">
      <Sidebar branding={branding} activeKey={activeKey} />

      <div className="flex min-w-0 flex-col">
        <Topbar branding={branding} title={title} meta={meta} />
        <main className="flex-1 p-5 md:p-7 xl:p-8">{children}</main>
      </div>
    </div>
  );
}
