import type { BrandingOrg } from '../../lib/branding/theme';
import { NAV_ITEMS, NAV_GROUPS } from '../../lib/shell/nav';
import { BrandChip, BrandLockup, hasBrandLockup, splitBrandName } from './BrandMark';
import { LogoutButton } from './LogoutButton';
import { LiveBadge } from './ShellData';

export interface SidebarProps {
  branding: BrandingOrg;
  // key del ítem activo (según la ruta actual).
  activeKey?: string;
}

// Variante de colapso: SidebarShell (client) marca data-sidebar en el group/shell;
// acá todo es CSS → este componente sigue siendo Server Component y togglear no
// re-renderiza nada. En colapsado: riel de iconos centrados con tooltip nativo
// (title), labels/badges ocultos, separadores en vez de títulos de grupo.
const HIDE = 'group-data-[sidebar=collapsed]/shell:hidden';

// Navigation drawer · estilo Google/Material 3: marca arriba (icono del
// tenant en blanco vía BrandChip + nombre en dos líneas para nombres largos),
// navegación agrupada con íconos, item activo con pill tonal
// (primary-container) + barra naranja, bloque de cuenta abajo. Visible en
// tablet/desktop (oculto en mobile).
export function Sidebar({ branding, activeKey }: SidebarProps) {
  const [nameTop, nameSub] = splitBrandName(branding.name);
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
    <aside
      id="app-sidebar"
      className={
        'hidden bg-surface md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-line ' +
        'md:w-64 xl:w-[17.5rem] group-data-[sidebar=collapsed]/shell:md:w-[4.5rem] group-data-[sidebar=collapsed]/shell:xl:w-[4.5rem] ' +
        'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out'
      }
    >
      {/* Marca. Tenants con lockup oficial (CCB): lockup horizontal a color,
          JUSTIFICADO con los labels de la nav ("PRINCIPAL": nav px-3 + label
          px-3 = 24px → px-6 acá); chip con el isotipo blanco en el riel. Sin
          lockup: chip + nombre en dos líneas. Un logo subido por el tenant
          (logoUrl) siempre gana. El toggle de colapso vive en el TOPBAR. */}
      {!branding.logoUrl && hasBrandLockup(branding.slug) ? (
        <div className="px-6 pb-2.5 pt-4 group-data-[sidebar=collapsed]/shell:flex group-data-[sidebar=collapsed]/shell:justify-center group-data-[sidebar=collapsed]/shell:px-0 group-data-[sidebar=collapsed]/shell:py-4">
          <BrandLockup slug={branding.slug} name={branding.name} className={`w-[176px] max-w-full ${HIDE}`} />
          <span className="hidden group-data-[sidebar=collapsed]/shell:block">
            <BrandChip slug={branding.slug} name={branding.name} />
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-6 py-4 group-data-[sidebar=collapsed]/shell:flex-col group-data-[sidebar=collapsed]/shell:gap-2 group-data-[sidebar=collapsed]/shell:px-0">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className={`h-9 w-auto ${HIDE}`} />
          ) : null}
          {/* Chip de marca (icono del tenant en blanco; si hay logo, sólo en colapsado). */}
          <span className={branding.logoUrl ? 'hidden group-data-[sidebar=collapsed]/shell:block' : 'block'}>
            <BrandChip slug={branding.slug} name={branding.name} />
          </span>
          <span className={`min-w-0 flex-1 ${HIDE}`}>
            <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight text-ink">{nameTop}</span>
            {nameSub ? (
              <span className="block truncate text-[12.5px] font-light leading-tight tracking-wide text-muted">{nameSub}</span>
            ) : null}
          </span>
        </div>
      )}

      {/* Navegación agrupada · scrollbar oculto (mantiene el scroll, sin la barra).
          El buscador global (⌘K) vive en el topbar (TopbarSearch), no acá. */}
      <nav
        aria-label="Navegación principal"
        className="flex-1 overflow-y-auto px-3 pb-2 group-data-[sidebar=collapsed]/shell:px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group}>
            <p className={`px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint ${HIDE}`}>
              {group}
            </p>
            {/* Separador del grupo cuando no hay título (modo riel) */}
            <hr aria-hidden="true" className="mx-2 mb-2 mt-3 hidden border-line group-data-[sidebar=collapsed]/shell:block" />
            <div className="flex flex-col gap-0.5">
              {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
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
                      'relative flex items-center gap-3.5 rounded-full px-3.5 py-2 text-sm transition-colors ' +
                      'group-data-[sidebar=collapsed]/shell:justify-center group-data-[sidebar=collapsed]/shell:px-0 ' +
                      (active
                        ? 'bg-primary-container font-semibold text-on-primary-container'
                        : 'font-medium text-muted hover:bg-surface-container hover:text-ink')
                    }
                  >
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-accent"
                      />
                    ) : null}
                    <ItemIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                    <span className={HIDE}>{item.label}</span>
                    {item.liveBadge ? (
                      <LiveBadge source={item.liveBadge} />
                    ) : item.badge ? (
                      <span
                        aria-hidden="true"
                        className={`ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-[#b35400] ${HIDE}`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Cuenta + cerrar sesión (compacto en modo riel) */}
      <div className="m-2 rounded-2xl bg-surface-container p-2 group-data-[sidebar=collapsed]/shell:bg-transparent group-data-[sidebar=collapsed]/shell:p-0">
        {trialBadge ? (
          <div className={`mx-2 mb-2.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[11px] font-semibold text-[#b35400] text-center ${HIDE}`}>
            {trialBadge}
          </div>
        ) : null}
        <div className={`flex items-center gap-3 px-2 py-1.5 ${HIDE}`}>
          <BrandChip slug={branding.slug} name={branding.name} rounded="rounded-full" bg="bg-brand" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-ink">Administración</span>
            <span className="block text-xs text-muted">Panel del tenant</span>
          </span>
        </div>
        <LogoutButton className="mt-1 group-data-[sidebar=collapsed]/shell:mt-0" />
      </div>
    </aside>
  );
}
