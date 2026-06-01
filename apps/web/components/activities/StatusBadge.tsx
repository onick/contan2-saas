import type { ActivityStatus } from '../../lib/activities/demoData';

const STYLE: Record<ActivityStatus, string> = {
  soon: 'bg-accent-soft text-[#b35400]',
  live: 'bg-success-bg text-success-fg',
  done: 'bg-surface-container text-muted',
  draft: 'border border-line text-faint',
};

// Chip de estado de una actividad (semáforo). Server Component.
export function StatusBadge({ status, label }: { status: ActivityStatus; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] ${STYLE[status]}`}>
      {label}
    </span>
  );
}
