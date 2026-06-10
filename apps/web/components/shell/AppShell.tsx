import type { ReactNode } from 'react';
import type { BrandingOrg } from '../../lib/branding/theme';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SidebarShell } from './SidebarShell';

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
//   md   (tablet 768): grid [auto 1fr] — la columna sigue el ancho del Sidebar,
//        que COLAPSA a riel de iconos (toggle/⌘B; preferencia en cookie aplicada
//        por script inline pre-paint → sin flash). Ver SidebarShell.
//   xl   (desktop 1280): sidebar 17.5rem expandido.
// `minmax(0,1fr)` en la columna de contenido evita overflow horizontal.
// Server Component (sin estado propio): el colapso vive en SidebarShell (client).
export function AppShell({ branding, title, activeKey, meta, children }: AppShellProps) {
  return (
    <SidebarShell>
      <Sidebar branding={branding} activeKey={activeKey} />

      <div className="flex min-w-0 flex-col">
        <Topbar branding={branding} title={title} meta={meta} />
        <main className="flex-1 p-5 md:p-7 xl:p-8">{children}</main>
      </div>
    </SidebarShell>
  );
}
