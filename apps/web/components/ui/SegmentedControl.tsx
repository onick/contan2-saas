import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface SegmentedControlItem {
  label: string;
  href: string;
  active?: boolean;
  // Icono opcional a la izquierda de la etiqueta (decorativo, aria-hidden).
  icon?: LucideIcon;
}

export interface SegmentedControlProps {
  items: SegmentedControlItem[];
  // 'outline' (por defecto): borde fino, activo en ink. 'tray': bandeja gris y activo en
  // accent-strong (secundario del tenant a ≥7:1), items de 44 px de alto (Inicio).
  variant?: 'outline' | 'tray';
  // Nombre accesible de la navegación (por defecto "Segmentos").
  label?: string;
  className?: string;
}

export function SegmentedControl({ items, variant = 'outline', label = 'Segmentos', className }: SegmentedControlProps) {
  const tray = variant === 'tray';
  return (
    <nav
      aria-label={label}
      className={cn(
        'inline-flex rounded-pill p-[3px]',
        tray ? 'bg-surface-container' : 'border border-line',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'rounded-pill px-4 text-sm font-semibold transition-colors',
            tray ? 'inline-flex min-h-11 items-center justify-center' : 'py-1.5',
            Icon && 'inline-flex items-center gap-2 whitespace-nowrap',
            item.active
              ? tray ? 'bg-accent-strong text-accent-strong-fg' : 'bg-ink text-white'
              : 'text-muted hover:text-ink',
          )}
        >
          {Icon ? <Icon size={16} strokeWidth={1.9} aria-hidden="true" className="flex-none" /> : null}
          {item.label}
        </Link>
        );
      })}
    </nav>
  );
}
