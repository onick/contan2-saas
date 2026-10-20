import Link from 'next/link';
import { AlertTriangle, Info, ChevronRight } from 'lucide-react';
import type { DashboardOverviewResponse } from '@contan2/contracts';
import { Card, cn, focusRing } from '../ui';

export const PERIOD_LABEL: Record<DashboardOverviewResponse['period'], string> = {
  today: 'Hoy', '7d': '7 días', '30d': '30 días', '90d': '90 días',
};

type Insight = DashboardOverviewResponse['insights'][number];

// Una fila de la franja "Atención hoy": icono tonal + texto + enlace. Sin borde de color
// lateral ni fondo propio: el contenedor es la tarjeta de la franja.
export function InsightBanner({ insight }: { insight: Insight }) {
  const warning = insight.severity === 'warning';
  const Icon = warning ? AlertTriangle : Info;
  return (
    <div
      role={warning ? 'alert' : 'status'}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid h-9 w-9 flex-none place-items-center rounded-full',
          warning ? 'bg-warning-bg text-warning-fg' : 'bg-surface-container text-muted',
        )}
      >
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-ink">{insight.title}</p>
        <p className="text-[13px] text-muted">{insight.message}</p>
      </div>
      <Link
        href="/app/actividades"
        className={cn(
          '-mr-2 inline-flex min-h-11 flex-none items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-brand-text hover:bg-surface-container',
          focusRing,
        )}
      >
        Ver actividades <ChevronRight size={14} strokeWidth={2.25} aria-hidden="true" />
      </Link>
    </div>
  );
}

// Franja compacta "Atención hoy": los avisos operativos del Inicio (baja inscripción,
// actividades sin inscripciones…), una fila por aviso. Sin avisos no renderiza nada.
export function AttentionStrip({ insights, className }: { insights: Insight[]; className?: string }) {
  if (insights.length === 0) return null;
  return (
    <Card padding="md" className={className} aria-labelledby="atencion-hoy-title" data-testid="atencion-hoy">
      <h2 id="atencion-hoy-title" className="mb-3 text-[17px] font-semibold tracking-tight text-ink">
        Atención hoy
      </h2>
      <div className="divide-y divide-line">
        {insights.map((i) => <InsightBanner key={i.type} insight={i} />)}
      </div>
    </Card>
  );
}
