import type { BrandingOrg } from '../../lib/branding/theme';
import { NAV_ITEMS } from '../../lib/shell/nav';

export interface SidebarProps {
  branding: BrandingOrg;
}

// Sidebar · estilo Geist/Vercel: hairline a la derecha, marca arriba, nav
// agrupada bajo un label, item activo con barra-acento naranja (3px) muy
// controlada. Visible en tablet/desktop (oculto en mobile → brand en Topbar).
// Server Component.
export function Sidebar({ branding }: SidebarProps) {
  return (
    <aside className="hidden border-r border-line bg-white md:sticky md:top-0 md:flex md:h-screen md:flex-col">
      {/* Marca */}
      <div className="flex h-14 items-center border-b border-line px-5">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.name} className="h-7 w-auto" />
        ) : (
          <span className="truncate text-[15px] font-bold leading-tight tracking-tight text-brand">
            {branding.name}
          </span>
        )}
      </div>

      {/* Sección + navegación */}
      <p className="px-5 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
        Gestión
      </p>
      <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-px px-2.5">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.key}
            href="#"
            aria-current={item.active ? 'page' : undefined}
            className={
              'relative rounded-lg px-3 py-2 text-[13px] transition-colors ' +
              (item.active
                ? 'bg-surface font-semibold text-ink'
                : 'font-medium text-muted hover:bg-surface hover:text-ink')
            }
          >
            {item.active ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 -left-2.5 w-[3px] rounded-full bg-brand-accent"
              />
            ) : null}
            {item.label}
          </a>
        ))}
      </nav>

      {/* Pie institucional */}
      <p className="border-t border-line px-5 py-4 text-[11px] tabular-nums text-faint">
        Operación · 2026
      </p>
    </aside>
  );
}
