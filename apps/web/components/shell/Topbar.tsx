import { Search } from 'lucide-react';
import type { BrandingOrg } from '../../lib/branding/theme';
import { BrandChip } from './BrandMark';
import { TopbarNotifications } from './TopbarNotifications';
import { TopbarUserMenu } from './TopbarUserMenu';

export interface TopbarProps {
  branding: BrandingOrg;
  title: string;
  // Texto opcional del chip a la derecha (ej. período).
  meta?: string;
}

// Top app bar · estilo Google/Material: breadcrumb, buscador, notificaciones
// REALES (TopbarNotifications: feed del log de auditoría con no-leídas
// honestas) y menú de usuario REAL (TopbarUserMenu: identidad de la sesión +
// Mi cuenta + Cerrar sesión). Mobile muestra el brand compacto (drawer
// oculto). El buscador sigue siendo visual (pendiente). Server Component
// (los hijos interactivos son client).
export function Topbar({ branding, title, meta }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur md:px-7">
      {/* Brand compacto (mobile, drawer oculto) */}
      <span className="flex items-center gap-2 md:hidden">
        <BrandChip slug={branding.slug} name={branding.name} className="h-8 w-8" rounded="rounded-[9px]" />
      </span>

      {/* Breadcrumb (tablet/desktop) */}
      <nav aria-label="Ruta" className="hidden items-center gap-2 text-[13px] text-muted md:flex">
        <span>Inicio</span>
        <span className="text-faint">/</span>
        <span className="font-semibold text-ink" aria-current="page">{title}</span>
      </nav>

      {/* Buscador · flex-1 + min-w-0 para encoger sin desbordar; el grupo
          derecho queda pinneado porque solo el buscador crece. */}
      <div className="ml-2 hidden min-w-0 max-w-[420px] flex-1 items-center gap-2.5 rounded-full bg-surface-container px-4 py-2.5 text-[13px] text-faint md:flex">
        <Search size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate">Buscar actividad, persona o reporte…</span>
      </div>

      {/* Grupo derecho · pinneado al borde con ml-auto */}
      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        {meta ? (
          <span className="hidden rounded-full border border-line bg-surface px-3 py-1 text-xs tabular-nums text-muted md:inline">
            {meta}
          </span>
        ) : null}

        <TopbarNotifications />

        {/* Menú de usuario: identidad de la sesión + Mi cuenta + Cerrar sesión
            (el logout vive acá; en mobile el menú es el acceso). */}
        <TopbarUserMenu orgName={branding.name} />
      </div>
    </header>
  );
}
