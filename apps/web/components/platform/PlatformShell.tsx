'use client';

// components/platform/PlatformShell.tsx · shell del "centro de mando" (super-admin).
// Tema oscuro propio, distinto del admin de tenant. Sidebar + topbar. El logout
// hace POST al BFF (/platform/api/logout → revoca sesión + limpia cookie).

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LayoutDashboard, Building2, ScrollText, LogOut, ShieldCheck } from 'lucide-react';
import type { PlatformAdminPublic } from '@contan2/contracts';

const NAV = [
  { key: 'operacion', label: 'Operación', href: '/platform', icon: LayoutDashboard },
  { key: 'tenants', label: 'Tenants', href: '/platform/tenants', icon: Building2 },
  { key: 'auditoria', label: 'Auditoría', href: '/platform/auditoria', icon: ScrollText },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/platform') return pathname === '/platform';
  return pathname === href || pathname.startsWith(href + '/');
}

export function PlatformShell({ admin, children }: { admin: PlatformAdminPublic; children: ReactNode }) {
  const pathname = usePathname() ?? '/platform';
  const initials = admin.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'PA';

  return (
    <div className="flex min-h-screen bg-[#0b0e13] text-white/90">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 flex-none flex-col border-r border-white/8 bg-[#0e1218] md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-[13.5px] font-semibold tracking-tight">contan2</p>
            <p className="text-[11px] text-white/40">Centro de mando</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <a key={item.key} href={item.href}
                className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition ${
                  active ? 'bg-white/10 font-semibold text-white' : 'font-medium text-white/55 hover:bg-white/5 hover:text-white/90'
                }`}>
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" /> {item.label}
              </a>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-[#0b0e13]/80 px-5 py-3 backdrop-blur">
          <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-white/35">Operador de plataforma</span>
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[12.5px] font-medium text-white/85">{admin.fullName}</p>
              <p className="text-[11px] text-white/40">{admin.email}</p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[11px] font-bold ring-1 ring-white/15">{initials}</span>
            <form method="POST" action="/platform/api/logout">
              <button type="submit" aria-label="Cerrar sesión"
                className="grid h-8 w-8 place-items-center rounded-lg text-white/45 hover:bg-white/5 hover:text-white/90">
                <LogOut size={17} aria-hidden="true" />
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-5 md:p-7">{children}</main>
      </div>
    </div>
  );
}
