import type { BrandingOrg } from '../../lib/branding/theme';
import { Icon } from '../icons';

export interface TopbarProps {
  branding: BrandingOrg;
  title: string;
  // Texto opcional del chip a la derecha (ej. período).
  meta?: string;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Top app bar · estilo Google/Material: breadcrumb, buscador, notificaciones y
// avatar. Mobile muestra el brand compacto (el drawer está oculto). Las
// affordances (buscar, notificaciones) son visuales; se cablean luego.
// Server Component.
export function Topbar({ branding, title, meta }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur md:px-7">
      {/* Brand compacto (mobile, drawer oculto) */}
      <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-brand md:hidden">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-brand text-xs font-bold text-white">
          {initials(branding.name)}
        </span>
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
        <Icon name="search" size={18} />
        <span className="truncate">Buscar actividad, persona o reporte…</span>
      </div>

      {/* Grupo derecho · pinneado al borde con ml-auto */}
      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        {meta ? (
          <span className="hidden rounded-full border border-line bg-surface px-3 py-1 text-xs tabular-nums text-muted md:inline">
            {meta}
          </span>
        ) : null}

        <button
          type="button"
          aria-label="Notificaciones"
          className="relative grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-surface-container"
        >
          <Icon name="bell" size={20} />
          <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-brand-accent ring-2 ring-surface" />
        </button>

        <span className="ml-0.5 grid h-9 w-9 flex-none place-items-center rounded-full bg-brand text-xs font-semibold text-white">
          {initials(branding.name)}
        </span>
      </div>
    </header>
  );
}
