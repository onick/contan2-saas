import { AlertTriangle, Info, ChevronRight } from 'lucide-react';
import type { DashboardOverviewResponse } from '@contan2/contracts';
import { cn, focusRing } from '../ui';

export const PERIOD_LABEL: Record<DashboardOverviewResponse['period'], string> = {
  today: 'Hoy', '7d': '7 días', '30d': '30 días', '90d': '90 días',
};

export function InsightBanner({ insight }: { insight: DashboardOverviewResponse['insights'][number] }) {
  const warning = insight.severity === 'warning';
  const Icon = warning ? AlertTriangle : Info;
  return (
    <div role={warning ? 'alert' : 'status'}
      className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
        warning ? 'border-warning-fg/30 bg-warning-bg' : 'border-line bg-surface')}>
      <Icon size={18} strokeWidth={2} aria-hidden="true" className={warning ? 'text-warning-fg' : 'text-faint'} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{insight.title}</p>
        <p className="text-[13px] text-muted">{insight.message}</p>
      </div>
      <a href="/app/actividades" className={cn('inline-flex flex-none items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-brand hover:bg-surface-container', focusRing)}>
        Ver actividades <ChevronRight size={14} strokeWidth={2.25} aria-hidden="true" />
      </a>
    </div>
  );
}
