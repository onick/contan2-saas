'use client';

// BibliotecaTabsNav — sub-navegación del módulo Biblioteca, en bandeja (tray) con iconos
// dentro de una tarjeta blanca, DEBAJO del encabezado de cada página (según el mockup del
// dueño 2026-10-20). Cliente hoja: solo lee usePathname() para la pestaña activa.
// En pantallas angostas la bandeja se desplaza en horizontal dentro de la tarjeta
// (sin overflow de página).

import { LayoutGrid, Library, Users, BookOpen, Bookmark, Boxes } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { BIBLIOTECA_TABS } from '../../lib/shell/nav';
import { SegmentedControl } from '../ui/SegmentedControl';

const TAB_ICONS: Record<string, LucideIcon> = {
  inicio: LayoutGrid,
  catalogo: Library,
  lectores: Users,
  prestamos: BookOpen,
  reservas: Bookmark,
  inventario: Boxes,
};

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
    <div className="mt-5 overflow-x-auto rounded-card bg-surface p-1.5 [scrollbar-width:none]">
      <SegmentedControl
        variant="tray"
        label="Secciones de Biblioteca"
        className="min-w-max"
        items={BIBLIOTECA_TABS.map((t) => ({
          label: t.label,
          href: t.href,
          active: t.key === activeKey,
          icon: TAB_ICONS[t.key],
        }))}
      />
    </div>
  );
}
