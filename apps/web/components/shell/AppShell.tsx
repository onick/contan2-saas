import type { ReactNode } from 'react';
import type { BrandingOrg } from '../../lib/branding/theme';
import { getAdminGate } from '../../lib/auth/session';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SidebarShell } from './SidebarShell';
import { MobileNav } from './MobileNav';

export interface AppShellProps {
  branding: BrandingOrg;
  title: string;
  // key del ítem de navegación activo (según la ruta).
  activeKey?: string;
  // Chip de contexto opcional en el Topbar (ej. período).
  meta?: string;
  // Rol del staff: filtra nav en Sidebar y MobileNav.
  // undefined → se lee del gate (producción); null → sin filtro (tests).
  role?: string | null;
  children: ReactNode;
}

// Estructura base del tenant-admin: Sidebar + (Topbar + main).
//   base (mobile 375): columna única, Sidebar oculto, barra inferior fija.
//   md   (tablet 768): grid [auto 1fr] — la columna sigue el ancho del Sidebar,
//        que COLAPSA a riel de iconos (toggle/⌘B; preferencia en cookie aplicada
//        por script inline pre-paint → sin flash). Ver SidebarShell.
//   xl   (desktop 1280): sidebar 17.5rem expandido.
// `minmax(0,1fr)` en la columna de contenido evita overflow horizontal.
// getAdminGate usa React.cache → una sola llamada por request compartida con
// el layout; en tests (sin contexto Next.js) el try/catch deja role=null.
export async function AppShell({ branding, title, activeKey, meta, children, role: roleProp }: AppShellProps) {
  // Cuando roleProp no se pasa (undefined), leemos el rol del gate cacheado.
  // En tests, getAdminGate lanza (cookies() no está disponible) → role=null.
  let role: string | null = roleProp !== undefined ? roleProp : null;
  if (roleProp === undefined) {
    try {
      const gate = await getAdminGate();
      role = (gate.status === 'ok' || gate.status === 'trial-ended') ? gate.staff.role : null;
    } catch {
      role = null;
    }
  }

  return (
    <SidebarShell>
      <Sidebar branding={branding} activeKey={activeKey} role={role} />
      {/* Navegación mobile (<md): barra inferior fija; el Sidebar existe md+. */}
      <MobileNav activeKey={activeKey} role={role} />

      <div className="flex min-w-0 flex-col">
        <Topbar branding={branding} title={title} meta={meta} />
        {/* pb-[...] reserva espacio para la barra inferior en mobile. */}
        <main className="flex-1 p-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-7 md:pb-7 xl:p-8 xl:pb-8">{children}</main>
      </div>
    </SidebarShell>
  );
}
