import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  // Acciones a la derecha (botones); envueltas en un grupo flex.
  actions?: ReactNode;
  // 1 = encabezado de página (h1 26/30px); 2 = encabezado de sección (h2 17px).
  level?: 1 | 2;
  className?: string;
}

export function SectionHeader({ title, subtitle, actions, level = 2, className }: SectionHeaderProps) {
  const Heading = level === 1 ? 'h1' : 'h2';
  const titleCls =
    level === 1
      ? 'text-[26px] font-bold tracking-tight text-ink xl:text-[30px]'
      : 'text-[17px] font-semibold tracking-tight text-ink';
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <Heading className={titleCls}>{title}</Heading>
        {subtitle ? (
          <p className={cn('mt-1', level === 1 ? 'text-muted' : 'text-[13px] text-muted')}>{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
