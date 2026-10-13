import type { BrandingOrg } from '../../lib/branding/theme';
import { NAV_ITEMS, NAV_GROUPS, filterNavByRole } from '../../lib/shell/nav';
import { BrandChip, splitBrandName } from './BrandMark';
import { LiveBadge } from './ShellData';
import { Badge } from '../ui/Badge';

export interface SidebarProps {
  branding: BrandingOrg;
  activeKey?: string;
  // Rol del staff autenticado: filtra los ítems de nav por el allowlist por rol.
  // null/undefined → sin confinamiento (owner/admin ven todo).
  role?: string | null;
}

// Clases que se ocultan cuando el sidebar está colapsado (CSS, sin re-render).
const HIDE = 'group-data-[sidebar=collapsed]/shell:hidden';

export function Sidebar({ branding, activeKey, role }: SidebarProps) {
  const [nameTop, nameSub] = splitBrandName(branding.name);
  const navItems = filterNavByRole(NAV_ITEMS, role);

  // Período de prueba: días restantes. Solo se muestra cuando trialEndsAt está
  // en el futuro (plan free con trial activo).
  const trialDaysLeft = branding.trialEndsAt
    ? Math.ceil((new Date(branding.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <aside
      id="app-sidebar"
      className={
        'hidden bg-surface md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-line ' +
        'md:w-[232px] group-data-[sidebar=collapsed]/shell:md:w-[4.5rem] ' +
        'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out'
      }
    >
      {/* Marca del tenant: logo real (logoUrl) o chip de iniciales. */}
      <div className="flex items-center gap-2.5 px-4 py-4 group-data-[sidebar=collapsed]/shell:flex-col group-data-[sidebar=collapsed]/shell:gap-2 group-data-[sidebar=collapsed]/shell:justify-center group-data-[sidebar=collapsed]/shell:px-0">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logoUrl}
            alt={branding.name}
            style={{ height: `${(36 * (branding.logoScale ?? 100)) / 100}px` }}
            className={`w-auto flex-none ${HIDE}`}
          />
        ) : null}
        {/* Chip siempre presente: visible en riel colapsado y cuando no hay logo */}
        <span className={branding.logoUrl ? `hidden group-data-[sidebar=collapsed]/shell:block` : 'block'}>
          <BrandChip slug={branding.slug} name={branding.name} className="h-8 w-8 rounded-[8px]" />
        </span>
        {/* Nombre + etiqueta: solo cuando no hay logo y el sidebar está expandido */}
        {!branding.logoUrl ? (
          <span className={`min-w-0 flex-1 ${HIDE}`}>
            <span className="block truncate text-[14px] font-semibold leading-tight text-ink">{nameTop}</span>
            <span className="block truncate text-[12px] font-medium leading-tight text-muted">
              {nameSub ? `${nameSub} · Admin` : 'Admin'}
            </span>
          </span>
        ) : (
          <span className={`text-[12px] font-medium text-muted ${HIDE}`}>Admin</span>
        )}
      </div>

      {/* Navegación agrupada. Grupos sin ítems se omiten (roles confinados). */}
      <nav
        aria-label="Navegación principal"
        className="flex-1 overflow-y-auto px-3 pb-4 group-data-[sidebar=collapsed]/shell:px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {NAV_GROUPS.map((group) => {
          const groupItems = navItems.filter((i) => i.group === group);
          if (!groupItems.length) return null;
          return (
            <div key={group}>
              <p className={`px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted ${HIDE}`}>
                {group}
              </p>
              <hr aria-hidden="true" className="mx-2 mb-2 mt-3 hidden border-line group-data-[sidebar=collapsed]/shell:block" />
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => {
                  const ItemIcon = item.icon;
                  const active = item.key === activeKey;
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      title={item.label}
                      className={
                        'relative flex h-9 items-center gap-2.5 rounded-[8px] px-3 text-[14px] transition-colors ' +
                        'group-data-[sidebar=collapsed]/shell:justify-center group-data-[sidebar=collapsed]/shell:px-0 ' +
                        (active
                          ? 'bg-brand-soft font-semibold text-brand-text'
                          : 'font-medium text-muted hover:bg-surface-container hover:text-ink')
                      }
                    >
                      <ItemIcon size={18} strokeWidth={1.75} aria-hidden="true" />
                      <span className={HIDE}>{item.label}</span>
                      {item.liveBadge ? (
                        <LiveBadge source={item.liveBadge} />
                      ) : item.badge ? (
                        <Badge tone="brand" className={`ml-auto ${HIDE}`}>{item.badge}</Badge>
                      ) : null}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Badge de período de prueba: visible solo cuando queda tiempo y el
          sidebar está expandido (se oculta en el riel colapsado). */}
      {trialDaysLeft !== null && trialDaysLeft > 0 ? (
        <div className={`border-t border-line px-3 py-2 ${HIDE}`}>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-[#b35400]">
            Prueba: {trialDaysLeft} {trialDaysLeft === 1 ? 'día restante' : 'días restantes'}
          </span>
        </div>
      ) : null}
    </aside>
  );
}
