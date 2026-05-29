import type { BrandingOrg } from '../../lib/branding/theme';
import { NAV_ITEMS } from '../../lib/shell/nav';

export interface SidebarProps {
  branding: BrandingOrg;
}

// Sidebar del shell tenant-admin. Visible en tablet/desktop (oculto en mobile,
// donde el brand vive en el Topbar). Server Component: sin estado ni handlers
// — la navegación es fake/local (los items no navegan todavía).
export function Sidebar({ branding }: SidebarProps) {
  return (
    <aside className="hidden border-r border-slate-200 bg-white md:flex md:flex-col">
      {/* Brand-mark: mismo patrón logo-or-name que BrandHeader (compacto). */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={branding.name} className="h-8 w-auto" />
        ) : (
          <span className="truncate text-base font-bold text-brand">{branding.name}</span>
        )}
      </div>

      <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.key}
            href="#"
            aria-current={item.active ? 'page' : undefined}
            className={
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
              (item.active
                ? 'bg-brand/10 text-brand'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
            }
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
