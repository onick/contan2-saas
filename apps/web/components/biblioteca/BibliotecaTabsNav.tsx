'use client';

// BibliotecaTabsNav — sub-navegación del módulo Biblioteca.
// Cliente hoja: solo lee usePathname() para determinar la pestaña activa.
// Full-bleed: extiende el nav al borde del área de contenido del AppShell.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BIBLIOTECA_TABS } from '../../lib/shell/nav';
import { cn, focusRing } from '../ui';

function activeTabKey(pathname: string): string {
  if (pathname === '/app/biblioteca') return 'inicio';
  if (pathname.startsWith('/app/biblioteca/catalogo') || pathname.startsWith('/app/biblioteca/titulos')) return 'catalogo';
  if (pathname.startsWith('/app/biblioteca/lectores')) return 'lectores';
  if (pathname.startsWith('/app/biblioteca/circulacion')) return 'prestamos';
  if (pathname.startsWith('/app/biblioteca/reservas')) return 'reservas';
  if (pathname.startsWith('/app/biblioteca/inventario')) return 'inventario';
  return '';
}

export function BibliotecaTabsNav() {
  const pathname = usePathname() ?? '';
  const activeKey = activeTabKey(pathname);

  return (
    // Negativa de márgenes del AppShell para que el borde inferior llegue de lado a lado.
    <nav
      aria-label="Secciones de Biblioteca"
      className="-mx-5 mb-6 overflow-x-auto border-b border-line md:-mx-7 xl:-mx-8"
    >
      <div className="flex px-5 [scroll-snap-type:x_mandatory] md:px-7 xl:px-8">
        {BIBLIOTECA_TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.key === activeKey ? 'page' : undefined}
            className={cn(
              '-mb-px flex-none px-4 py-2.5 text-sm font-medium transition-colors [scroll-snap-align:start]',
              'border-b-2',
              focusRing,
              t.key === activeKey
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
