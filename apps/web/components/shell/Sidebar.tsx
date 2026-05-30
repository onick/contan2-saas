import type { BrandingOrg } from '../../lib/branding/theme';
import { NAV_ITEMS, NAV_GROUPS } from '../../lib/shell/nav';
import { Icon } from '../icons';

export interface SidebarProps {
  branding: BrandingOrg;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// Navigation drawer · estilo Google/Material 3: marca arriba, navegación
// agrupada con íconos, item activo con pill tonal (primary-container) + barra
// naranja, bloque de cuenta abajo. Visible en tablet/desktop (oculto en mobile).
// Server Component (sin estado): la navegación es fake/local todavía.
export function Sidebar({ branding }: SidebarProps) {
  return (
    <aside className="hidden bg-surface md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-line">
      {/* Marca */}
      <div className="flex items-center gap-3 px-5 py-4">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.name} className="h-9 w-auto" />
        ) : (
          <>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-[11px] bg-brand text-sm font-bold text-white shadow-sm">
              {initials(branding.name)}
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
              {branding.name}
            </span>
          </>
        )}
      </div>

      {/* Navegación agrupada */}
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 pb-2">
        {NAV_GROUPS.map((group) => (
          <div key={group}>
            <p className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              {group}
            </p>
            <div className="flex flex-col gap-0.5">
              {NAV_ITEMS.filter((i) => i.group === group).map((item) => (
                <a
                  key={item.key}
                  href="#"
                  aria-label={item.label}
                  aria-current={item.active ? 'page' : undefined}
                  className={
                    'relative flex items-center gap-3.5 rounded-full px-3.5 py-2.5 text-sm transition-colors ' +
                    (item.active
                      ? 'bg-primary-container font-semibold text-on-primary-container'
                      : 'font-medium text-muted hover:bg-surface-container hover:text-ink')
                  }
                >
                  {item.active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-brand-accent"
                    />
                  ) : null}
                  <Icon name={item.icon} size={21} />
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span
                      aria-hidden="true"
                      className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-[#b35400]"
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Cuenta (placeholder hasta el wiring de auth) */}
      <div className="m-2 flex items-center gap-3 rounded-2xl bg-surface-container px-4 py-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand text-sm font-semibold text-white">
          {initials(branding.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-ink">Administración</span>
          <span className="block text-xs text-muted">Tenant</span>
        </span>
        <Icon name="expand" size={18} className="ml-auto text-faint" />
      </div>
    </aside>
  );
}
