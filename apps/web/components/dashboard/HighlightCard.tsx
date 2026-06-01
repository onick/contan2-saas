import { TrendingUp } from 'lucide-react';
import type { HighlightActivity } from '../../lib/dashboard/demoData';
import { Card } from '../ui';

export interface HighlightCardProps {
  activity: HighlightActivity;
}

const R = 34;
const CIRC = 2 * Math.PI * R;

// Caso destacado · anillo de ocupación (SVG inline) en color de acento. Server
// Component.
export function HighlightCard({ activity }: HighlightCardProps) {
  const pct = Math.max(0, Math.min(100, activity.occupancyPct));
  const offset = CIRC * (1 - pct / 100);

  return (
    <Card padding="lg" className="flex min-w-0 flex-col">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-accent">
        Actividad destacada
      </p>
      <h3 className="mt-2 text-[18px] font-semibold tracking-tight text-ink">{activity.title}</h3>
      <p className="text-[13px] text-muted">{activity.category}</p>

      <div className="mt-5 flex items-center gap-5">
        <svg viewBox="0 0 80 80" className="h-[88px] w-[88px] flex-none" role="img" aria-label={`${pct}% de ocupación`}>
          <circle cx="40" cy="40" r={R} fill="none" stroke="var(--color-surface-container)" strokeWidth="9" />
          <circle
            cx="40" cy="40" r={R} fill="none" stroke="var(--color-brand-accent)" strokeWidth="9"
            strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset}
            transform="rotate(-90 40 40)"
          />
          <text x="40" y="40" textAnchor="middle" dominantBaseline="central" className="fill-ink text-[18px] font-bold">
            {pct}%
          </text>
        </svg>
        <div>
          <p className="text-[24px] font-bold tracking-tight tabular-nums text-ink">
            {activity.registered}
            <span className="text-[16px] font-normal text-faint"> / {activity.capacity}</span>
          </p>
          <p className="text-[13px] text-muted">inscripciones confirmadas</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[13px] text-muted">
        <TrendingUp size={18} strokeWidth={2} aria-hidden="true" className="text-brand-accent" />
        {activity.note}
      </div>
    </Card>
  );
}
