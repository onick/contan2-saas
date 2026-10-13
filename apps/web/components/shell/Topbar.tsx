import type { BrandingOrg } from '../../lib/branding/theme';
import { SidebarToggle } from './SidebarShell';
import { TopbarNotifications } from './TopbarNotifications';
import { TopbarUserMenu } from './TopbarUserMenu';
import { TopbarSearch, TopbarSearchIcon } from './ShellData';
import { BrandChip } from './BrandMark';

export interface TopbarProps {
  branding: BrandingOrg;
  title: string;
  // Texto opcional del chip a la derecha (ej. período).
  meta?: string;
}

// Top app bar · estilo Google/Material: breadcrumb, buscador, notificaciones
// REALES (TopbarNotifications: feed del log de auditoría con no-leídas
// honestas) y menú de usuario REAL (TopbarUserMenu: identidad de la sesión +
// Mi cuenta + Cerrar sesión). La navegación mobile la gestiona la barra
// inferior (MobileNav), no un drawer desde este header. Server Component
// (los hijos interactivos son client).
export function Topbar({ branding, title, meta }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-6 backdrop-blur">
      {/* Colapso del sidebar (movido del header del sidebar; el sidebar solo
          existe md+, en mobile no hay nada que colapsar) */}
      <SidebarToggle className="hidden flex-none md:grid" />

      {/* Logo del tenant · solo mobile (md+ lo muestra el sidebar) */}
      <div className="flex flex-none items-center md:hidden">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt={branding.name}
            style={{ height: `${(32 * (branding.logoScale ?? 100)) / 100}px` }}
            className="w-auto"
          />
        ) : (
          <BrandChip slug={branding.slug} name={branding.name} className="h-8 w-8 rounded-[8px]" />
        )}
      </div>

      {/* Breadcrumb (tablet/desktop) */}
      <nav aria-label="Ruta" className="hidden items-center gap-2 text-[13px] text-muted md:flex">
        <span>Inicio</span>
        <span className="text-faint">/</span>
        <span className="font-semibold text-ink" aria-current="page">{title}</span>
      </nav>

      {/* Buscador · abre el command palette (⌘K). flex-1 + min-w-0 para encoger
          sin desbordar; el grupo derecho queda pinneado porque solo crece este. */}
      <TopbarSearch />

      {/* Grupo derecho · pinneado al borde con ml-auto */}
      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        {meta ? (
          <span className="hidden rounded-full border border-line bg-surface px-3 py-1 text-xs tabular-nums text-muted md:inline">
            {meta}
          </span>
        ) : null}

        {/* Búsqueda compacta · solo mobile */}
        <TopbarSearchIcon />

        <TopbarNotifications />

        {/* Menú de usuario: identidad de la sesión + Mi cuenta + Cerrar sesión
            (el logout vive acá; en mobile el menú es el acceso). */}
        <TopbarUserMenu orgName={branding.name} />
      </div>
    </header>
  );
}
