import type { DashboardInsight } from '../../lib/dashboard/demoData';
import { Icon } from '../icons';

export interface InsightCardProps {
  insight: DashboardInsight;
}

// Tarjeta de insight/atención · ícono tonal + título + mensaje. Sin emojis ni
// texto técnico. El tono define el color (ámbar para atención, índigo para
// informativo). Server Component.
export function InsightCard({ insight }: InsightCardProps) {
  const warn = insight.tone === 'warn';
  return (
    <section className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-6">
      <span
        className={
          'grid h-10 w-10 flex-none place-items-center rounded-xl ' +
          (warn ? 'bg-accent-soft text-[#b35400]' : 'bg-primary-container text-on-primary-container')
        }
      >
        <Icon name={warn ? 'bellRing' : 'insight'} size={21} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{insight.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{insight.message}</p>
      </div>
    </section>
  );
}
