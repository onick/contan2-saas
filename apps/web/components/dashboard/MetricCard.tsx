import type { DashboardMetric } from '../../lib/dashboard/demoData';

export interface MetricCardProps {
  metric: DashboardMetric;
}

// Card de métrica · estilo Geist/Vercel: hairline, mucho aire, valor grande en
// Geist Mono (tabular). La métrica ancla lleva un top-accent naranja sutil.
// Server Component.
export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-line bg-white p-5 md:p-6">
      {metric.anchor ? (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-brand-accent" />
      ) : null}
      <p className="text-sm font-medium text-muted">{metric.label}</p>
      <p className="mt-2.5 font-mono text-[34px] font-medium leading-none tracking-tight tabular-nums text-ink md:text-[38px]">
        {metric.value}
      </p>
      {metric.unit ? <p className="mt-2 text-xs text-faint">{metric.unit}</p> : null}
    </article>
  );
}
