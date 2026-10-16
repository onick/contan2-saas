import type { ReactNode } from 'react';
import { CloudOff, Lock } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';

export interface ErrorStateProps {
  // 'error' = la API falló (red/5xx); 'forbidden' = el rol no tiene permiso.
  kind?: 'error' | 'forbidden';
  title?: string;
  description?: string;
  // Si se pasa, muestra "Reintentar" (solo tiene sentido en kind="error").
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}

// Contraparte honesta de EmptyState: se usa cuando NO sabemos si hay datos
// porque la carga falló o el rol no tiene permiso. Nunca debe confundirse con
// "no hay datos". Anuncia con role="alert".
export function ErrorState({ kind = 'error', title, description, onRetry, action, className }: ErrorStateProps) {
  const forbidden = kind === 'forbidden';
  const Icon = forbidden ? Lock : CloudOff;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-danger-bg text-danger-fg">
        <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-ink">
          {title ?? (forbidden ? 'No tienes permiso para ver esto' : 'No pudimos cargar los datos')}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">
          {description ??
            (forbidden
              ? 'Tu rol no incluye este módulo. Si crees que es un error, habla con un administrador.'
              : 'Hubo un problema al consultar el servidor. Esto no significa que no haya datos.')}
        </p>
      </div>
      {onRetry || action ? (
        <div className="mt-1 flex items-center gap-2">
          {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Reintentar</Button> : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
