'use client';

// components/platform/PlatformShell.tsx · shell del "centro de mando" (super-admin).
// Tema oscuro propio. Sidebar (desktop) + barra de nav (mobile) + topbar. Logout
// por POST al BFF. La cuenta linkea a /platform/cuenta.

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LayoutDashboard, Building2, ScrollText, UserCircle2, LogOut, ShieldCheck } from 'lucide-react';
import type { PlatformAdminPublic } from '@contan2/contracts';

const NAV = [
  { key: 'operacion', label: 'Operación', href: '/platform', icon: LayoutDashboard },
  { key: 'tenants', label: 'Tenants', href: '/platform/tenants', icon: Building2 },
  { key: 'auditoria', label: 'Auditoría', href: '/platform/auditoria', icon: ScrollText },
  { key: 'cuenta', label: 'Mi cuenta', href: '/platform/cuenta', icon: UserCircle2 },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/platform') return pathname === '/platform';
  return pathname === href || pathname.startsWith(href + '/');
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'PA';
}

export function PlatformShell({ admin, children }: { admin: PlatformAdminPublic; children: ReactNode }) {
  const pathname = usePathname() ?? '/platform';

  return (
    <div className="flex min-h-screen bg-[#0a0d12] text-white/90 [background-image:radial-gradient(60rem_40rem_at_100%_-10%,rgba(56,120,255,0.06),transparent)]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col border-r border-white/8 bg-[#0d1117]/90 backdrop-blur md:flex">
        <a href="/platform" className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-white/15 to-white/5 ring-1 ring-white/15">
            <ShieldCheck size={19} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-[13.5px] font-semibold tracking-tight">contan2</p>
            <p className="text-[10.5px] uppercase tracking-[0.14em] text-white/35">Centro de mando</p>
          </div>
        </a>
        <nav className="flex-1 px-3 py-2">
          {NAV.map((item) => {
            const Icon = item.icon; const active = isActive(pathname, item.href);
            return (
              <a key={item.key} href={item.href}
                className={`group relative mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition ${
                  active ? 'bg-white/10 font-semibold text-white' : 'font-medium text-white/50 hover:bg-white/5 hover:text-white/90'
                }`}>
                {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-sky-400" aria-hidden="true" /> : null}
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" /> {item.label}
              </a>
            );
          })}
        </nav>
        {/* Cuenta + logout */}
        <div className="border-t border-white/8 p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <a href="/platform/cuenta" className="flex min-w-0 flex-1 items-center gap-2.5" title="Mi cuenta">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/10 text-[11px] font-bold ring-1 ring-white/15">{initials(admin.fullName)}</span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[12.5px] font-medium text-white/85">{admin.fullName}</span>
                <span className="block truncate text-[11px] text-white/35">{admin.email}</span>
              </span>
            </a>
            <form method="POST" action="/platform/api/logout">
              <button type="submit" aria-label="Cerrar sesión" className="grid h-8 w-8 place-items-center rounded-lg text-white/40 transition hover:bg-white/5 hover:text-white/90">
                <LogOut size={16} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar (mobile: marca + logout; desktop: contexto) */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/8 bg-[#0a0d12]/80 px-4 py-3 backdrop-blur md:px-7">
          <span className="flex items-center gap-2 md:hidden">
            <ShieldCheck size={17} aria-hidden="true" /> <span className="text-[13px] font-semibold">Centro de mando</span>
          </span>
          <span className="hidden text-[11.5px] font-medium uppercase tracking-[0.12em] text-white/30 md:block">Operador de plataforma</span>
          <div className="flex items-center gap-2">
            <a href="/platform/cuenta" className="hidden items-center gap-2 rounded-lg px-2 py-1 text-right hover:bg-white/5 sm:flex" title="Mi cuenta">
              <span className="leading-tight">
                <span className="block text-[12.5px] font-medium text-white/85">{admin.fullName}</span>
                <span className="block text-[11px] text-white/40">{admin.email}</span>
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[11px] font-bold ring-1 ring-white/15">{initials(admin.fullName)}</span>
            </a>
            <form method="POST" action="/platform/api/logout" className="sm:hidden">
              <button type="submit" aria-label="Cerrar sesión" className="grid h-8 w-8 place-items-center rounded-lg text-white/45 hover:bg-white/5"><LogOut size={17} /></button>
            </form>
          </div>
        </header>

        {/* Nav mobile (pills) */}
        <nav className="flex gap-1.5 overflow-x-auto border-b border-white/8 px-4 py-2 md:hidden [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <a key={item.key} href={item.href}
                className={`flex-none rounded-full px-3 py-1.5 text-[12.5px] font-medium ${active ? 'bg-white/12 text-white' : 'text-white/50 hover:bg-white/5'}`}>
                {item.label}
              </a>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
