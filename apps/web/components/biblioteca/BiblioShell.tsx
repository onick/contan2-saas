'use client';

// components/biblioteca/BiblioShell.tsx · SUB-SHELL de la Biblioteca: dentro de
// /app/biblioteca/** la app cambia a su propia navegación (decisión aprobada:
// "otra app por dentro, misma plataforma por debajo"). Sidebar propio con las
// secciones del módulo (las futuras marcadas "Pronto"), branding del tenant, y
// "Volver al panel" para salir al admin general. Misma sesión/RBAC/kit.
//   · lg+: sidebar fijo (sticky) + contenido.
//   · <lg: topbar sticky con marca + nav horizontal de las secciones activas.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Library, Users, ArrowLeftRight, Bookmark, ClipboardList, PackagePlus,
  BarChart3, Settings, ArrowLeft, type LucideIcon,
} from 'lucide-react';
import type { BrandingOrg } from '../../lib/branding/theme';
import { BrandChip } from '../shell/BrandMark';
import { cn, focusRing } from '../ui';

interface BiblioNavItem { key: string; label: string; href: string; Icon: LucideIcon; soon?: boolean }

const NAV: BiblioNavItem[] = [
  { key: 'inicio', label: 'Inicio', href: '/app/biblioteca', Icon: Home },
  { key: 'catalogo', label: 'Catálogo', href: '/app/biblioteca/catalogo', Icon: Library },
  // Las siguientes llegan con F2-F6 del plan (docs/plan-modulo-biblioteca.md).
  { key: 'lectores', label: 'Lectores', href: '#', Icon: Users, soon: true },
  { key: 'circulacion', label: 'Circulación', href: '#', Icon: ArrowLeftRight, soon: true },
  { key: 'reservas', label: 'Reservas', href: '#', Icon: Bookmark, soon: true },
  { key: 'inventario', label: 'Inventario', href: '#', Icon: ClipboardList, soon: true },
  { key: 'adquisiciones', label: 'Adquisiciones', href: '#', Icon: PackagePlus, soon: true },
  { key: 'reportes', label: 'Reportes', href: '#', Icon: BarChart3, soon: true },
  { key: 'configuracion', label: 'Configuración', href: '#', Icon: Settings, soon: true },
];

function activeKeyFor(pathname: string): string {
  if (pathname === '/app/biblioteca') return 'inicio';
  if (pathname.startsWith('/app/biblioteca/catalogo') || pathname.startsWith('/app/biblioteca/titulos')) return 'catalogo';
  return '';
}

export function BiblioShell({ branding, children }: { branding: BrandingOrg; children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const active = activeKeyFor(pathname);

  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* ── Sidebar propio (lg+) ── */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <BrandChip slug={branding.slug} name={branding.name} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold leading-tight text-ink">{branding.name}</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">Biblioteca</span>
          </span>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3" aria-label="Navegación de la biblioteca">
          <ul className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <li key={item.key}>
                {item.soon ? (
                  <span className="flex cursor-default items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium text-faint/70" aria-disabled="true" title="Llega en las próximas fases">
                    <item.Icon size={17} strokeWidth={1.9} />
                    {item.label}
                    <span className="ml-auto rounded-full bg-surface-container px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-faint">Pronto</span>
                  </span>
                ) : (
                  <Link href={item.href} aria-current={active === item.key ? 'page' : undefined}
                    className={cn('flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] transition-colors', focusRing,
                      active === item.key ? 'bg-brand/10 font-bold text-brand' : 'font-medium text-muted hover:bg-surface-container hover:text-ink')}>
                    <item.Icon size={17} strokeWidth={1.9} />
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-line p-3">
          <Link href="/app" className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-muted hover:bg-surface-container hover:text-ink', focusRing)}>
            <ArrowLeft size={15} strokeWidth={2} /> Volver al panel
          </Link>
        </div>
      </aside>

      {/* ── Mobile: barra superior + nav horizontal ── */}
      <div className="min-w-0">
        <div className="sticky top-0 z-30 border-b border-line bg-surface lg:hidden">
          <div className="flex items-center gap-3 px-4 pt-3">
            <BrandChip slug={branding.slug} name={branding.name} className="h-8 w-8" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{branding.name} · <span className="text-brand">Biblioteca</span></span>
            <Link href="/app" aria-label="Volver al panel" className={cn('grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-surface-container', focusRing)}>
              <ArrowLeft size={16} strokeWidth={2} />
            </Link>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 py-2" aria-label="Secciones de la biblioteca">
            {NAV.filter((i) => !i.soon).map((item) => (
              <Link key={item.key} href={item.href}
                className={cn('flex flex-none items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold', focusRing,
                  active === item.key ? 'bg-brand text-white' : 'text-muted hover:bg-surface-container')}>
                <item.Icon size={14} strokeWidth={2} /> {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <main className="p-5 md:p-7 xl:p-8">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
