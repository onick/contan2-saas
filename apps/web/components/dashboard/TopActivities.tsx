import { CalendarDays, ChevronRight } from 'lucide-react';
import type { RankedActivity } from '../../lib/dashboard/demoData';
import { CategoryChip } from '../CategoryChip';

export interface TopActivitiesProps {
  activities: RankedActivity[];
}

// Top actividades por asistencia · lista rankeada con miniatura (placeholder),
// categoría y barra de ocupación. Server Component.
export function TopActivities({ activities }: TopActivitiesProps) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 md:px-6">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">Top actividades</h3>
          <p className="text-xs text-faint">Las de mayor asistencia del período</p>
        </div>
        <a href="#" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
          Ver todas <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        </a>
      </div>

      <ul>
        {activities.map((a, i) => (
          <li key={a.id} className="flex items-center gap-4 border-t border-line px-5 py-3.5 md:px-6">
            <span className="w-4 flex-none text-center text-sm font-bold tabular-nums text-faint">{i + 1}</span>
            <span
              aria-hidden="true"
              className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-gradient-to-br from-brand to-[#3949ab] text-white"
            >
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium tracking-tight text-ink">{a.title}</p>
              <CategoryChip category={a.category} className="mt-0.5" />
            </div>
            <div className="hidden w-28 flex-none sm:block">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="tabular-nums">{a.registered}/{a.capacity}</span>
                <span className="font-semibold tabular-nums text-ink">{a.occupancyPct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                <div className="h-full rounded-full bg-brand" style={{ width: `${a.occupancyPct}%` }} />
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums text-ink sm:hidden">{a.occupancyPct}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
