import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  // CTA opcional (ej. <Button>Crear actividad</Button>).
  action?: ReactNode;
  className?: string;
}

// Estado vacío que enseña la interfaz (no "nada aquí"). Para tablas/listas sin
// resultados o sin datos todavía.
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-container text-faint">
        <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
