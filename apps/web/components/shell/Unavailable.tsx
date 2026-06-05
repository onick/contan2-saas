import { CloudOff, RefreshCw } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';

export interface UnavailableProps {
  // `inline` para reemplazar una sección dentro del shell; sin él ocupa la
  // pantalla completa (gate del layout cuando api-v2 está caído).
  inline?: boolean;
  title?: string;
  description?: string;
}

// Estado honesto de indisponibilidad. Se muestra cuando api-v2 no responde:
// JAMÁS datos demo en su lugar (esa es la regla del PR). Ofrece reintentar.
export function Unavailable({
  inline = false,
  title = 'Servicio no disponible',
  description = 'No pudimos cargar los datos en este momento. Volvé a intentarlo en unos segundos.',
}: UnavailableProps) {
  const card = (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-sm">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-container text-muted">
        <CloudOff size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-[17px] font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 text-[13px] text-muted">{description}</p>
      <a
        href=""
        className={cn(
          'mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-strong px-4 text-[14px] font-semibold text-white shadow-sm transition hover:brightness-95',
          focusRing,
        )}
      >
        <RefreshCw size={16} strokeWidth={2.25} aria-hidden="true" />
        Reintentar
      </a>
    </div>
  );

  if (inline) return <div className="py-8">{card}</div>;
  return <div className="grid min-h-screen place-items-center bg-page px-5">{card}</div>;
}
