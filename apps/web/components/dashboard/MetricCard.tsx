import type { DashboardMetric } from '../../lib/dashboard/demoData';

export interface MetricCardProps {
  metric: DashboardMetric;
}

// Card de una métrica del dashboard. El valor usa text-brand → hereda el
// theming por tenant. Server Component (sin estado).
export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <p className="text-sm font-medium text-slate-500">{metric.label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-brand md:text-4xl">
        {metric.value}
      </p>
      {metric.hint ? <p className="mt-1 text-xs text-slate-400">{metric.hint}</p> : null}
    </article>
  );
}
