'use client';

// BibliotecaTabsNav — sub-navegación del módulo Biblioteca.
// Cliente hoja: solo lee usePathname() para determinar la pestaña activa.
// Alineado al contenido (mismo contenedor --content-max que el resto del admin): la
// primera pestaña arranca en la misma x que el h1 de cualquier sección y el borde
// inferior mide lo mismo que las tablas/tarjetas de abajo. Antes era full-bleed
// (márgenes negativos del padding de <main>), lo que en pantallas anchas lo
// desalineaba del contenido.

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
    <nav
      aria-label="Secciones de Biblioteca"
      className="mb-6 overflow-x-auto border-b border-line"
    >
      <div className="flex [scroll-snap-type:x_mandatory]">
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
                ? 'border-brand-text text-ink'
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
