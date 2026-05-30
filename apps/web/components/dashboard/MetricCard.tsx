import { HelpCircle, ArrowUp, ArrowDown } from 'lucide-react';
import type { DashboardMetric } from '../../lib/dashboard/demoData';

export interface MetricCardProps {
  metric: DashboardMetric;
}

// Tarjeta de KPI · sigue la referencia aprobada: label en mayúsculas + ícono de
// ayuda, número grande, unidad (%) en línea aparte, chip de tendencia verde/rojo.
// Server Component.
export function MetricCard({ metric }: MetricCardProps) {
  const trend = metric.trend;
  return (
    <article className="flex flex-col items-start rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-6">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
        {metric.label}
        <HelpCircle size={14} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
      </p>

      <p className="mt-4 text-[40px] font-bold leading-none tracking-tight tabular-nums text-ink">
        {metric.value}
      </p>
      {metric.unit ? <p className="mt-2 text-[15px] font-medium text-muted">{metric.unit}</p> : null}

      {trend ? (
        <span
          className={
            'mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold ' +
            (trend.dir === 'up'
              ? 'bg-success-bg text-success-fg'
              : 'bg-danger-bg text-danger-fg')
          }
        >
          {trend.dir === 'up' ? (
            <ArrowUp size={15} strokeWidth={2.25} aria-hidden="true" />
          ) : (
            <ArrowDown size={15} strokeWidth={2.25} aria-hidden="true" />
          )}
          {trend.label}
        </span>
      ) : null}
    </article>
  );
}
