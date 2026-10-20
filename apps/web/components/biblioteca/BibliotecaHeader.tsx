// BibliotecaHeader — cabecera común del módulo Biblioteca (mockup del dueño 2026-10-20):
// título del módulo + subtítulo + acciones opcionales y, debajo, la bandeja de pestañas.
// `as` decide el elemento del título: 'h1' solo en el Inicio; en el resto de páginas el h1
// es el de la sección (Catálogo, Lectores…) y el título del módulo es un párrafo.
import type { ReactNode } from 'react';
import { BibliotecaTabsNav } from './BibliotecaTabsNav';
import { cn } from '../ui/cn';

export interface BibliotecaHeaderProps {
  as: 'h1' | 'p';
  actions?: ReactNode;
  className?: string;
}

export function BibliotecaHeader({ as: Title, actions, className }: BibliotecaHeaderProps) {
  return (
    <div className={cn('app-reveal', className)}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Title className="text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">Biblioteca</Title>
          <p className="mt-1 max-w-prose text-muted">Catálogo, préstamos y lectores</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      <BibliotecaTabsNav />
    </div>
  );
}
