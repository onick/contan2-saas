'use client';

// components/shell/MobileNav.tsx · navegación en CELULAR (<md). El Sidebar real
// es md+ (hidden en mobile), así que sin esto el teléfono no tiene menú. Drawer
// off-canvas: hamburguesa (MobileNavToggle en el Topbar) → overlay + panel que
// entra desde la izquierda. Cierra al tocar el fondo, con Escape (en SidebarShell)
// o al elegir un item. Reusa la misma fuente de nav que el Sidebar.

import { X } from 'lucide-react';
import type { BrandingOrg } from '../../lib/branding/theme';
import { NAV_ITEMS, NAV_GROUPS } from '../../lib/shell/nav';
import { BrandChip, BrandLockup, hasBrandLockup, splitBrandName } from './BrandMark';
import { LogoutButton } from './LogoutButton';
import { useSidebar } from './SidebarShell';
import { cn, focusRing } from '../ui/cn';

export function MobileNav({ branding, activeKey }: { branding: BrandingOrg; activeKey?: string }) {
  const { mobileOpen, closeMobile } = useSidebar();
  const [nameTop, nameSub] = splitBrandName(branding.name);

  return (
    <div className="md:hidden" aria-hidden={!mobileOpen}>
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar navegación"
        onClick={closeMobile}
        className={cn('fixed inset-0 z-40 bg-ink/40 transition-opacity motion-safe:duration-200',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      {/* Panel */}
      <aside
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Navegación"
        className={cn('fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[86vw] flex-col bg-surface shadow-2xl transition-transform motion-safe:duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full')}
      >
        {/* Marca + cerrar */}
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          {branding.logoUrl ? (
            // Altura base 36px escalada por logoScale% (mismo criterio que el sidebar).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="w-auto" style={{ height: `${(36 * (branding.logoScale ?? 100)) / 100}px` }} />
          ) : hasBrandLockup(branding.slug) ? (
            <BrandLockup slug={branding.slug} name={branding.name} className="w-[150px] max-w-full" />
          ) : (
            <span className="flex items-center gap-2.5">
              <BrandChip slug={branding.slug} name={branding.name} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold leading-tight text-ink">{nameTop}</span>
                {nameSub ? <span className="block truncate text-[12px] font-light leading-tight text-muted">{nameSub}</span> : null}
              </span>
            </span>
          )}
          <button type="button" onClick={closeMobile} aria-label="Cerrar"
            className={cn('grid h-9 w-9 flex-none place-items-center rounded-lg text-faint hover:bg-surface-container hover:text-ink', focusRing)}>
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* Navegación */}
        <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group}>
              <p className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{group}</p>
              <div className="flex flex-col gap-0.5">
                {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
                  const ItemIcon = item.icon;
                  const active = item.key === activeKey;
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      onClick={closeMobile}
                      aria-current={active ? 'page' : undefined}
                      className={cn('relative flex min-h-11 items-center gap-3.5 rounded-full px-3.5 py-2 text-[15px] transition-colors', focusRing,
                        active ? 'bg-primary-container font-semibold text-on-primary-container' : 'font-medium text-muted hover:bg-surface-container hover:text-ink')}
                    >
                      {active ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-accent" /> : null}
                      <ItemIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                      <span>{item.label}</span>
                      {item.badge ? <span aria-hidden="true" className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-[#b35400]">{item.badge}</span> : null}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Cuenta + cerrar sesión */}
        {(() => {
          let trialBadge = null;
          if (branding.status === 'active' && branding.plan === 'free' && branding.trialEndsAt) {
            const ends = new Date(branding.trialEndsAt);
            const now = new Date();
            const diffTime = ends.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              trialBadge = `Prueba: ${diffDays} ${diffDays === 1 ? 'día restante' : 'días restantes'}`;
            }
          }
          return (
            <div className="m-2 rounded-2xl bg-surface-container p-2">
              {trialBadge ? (
                <div className="mx-2 mb-2.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[11px] font-semibold text-[#b35400] text-center">
                  {trialBadge}
                </div>
              ) : null}
              <div className="flex items-center gap-3 px-2 py-1.5">
                <BrandChip slug={branding.slug} name={branding.name} rounded="rounded-full" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">Administración</span>
                  <span className="block text-xs text-muted">Panel de tu organización</span>
                </span>
              </div>
              <LogoutButton className="mt-1" />
            </div>
          );
        })()}
      </aside>
    </div>
  );
}
