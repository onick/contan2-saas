import { CalendarDays, MessagesSquare, Film, Music, Image, Wrench, MapPin, CalendarSearch } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Activity, ActivityStatus } from '../../lib/activities/demoData';
import { StatusBadge } from './StatusBadge';
import { CategoryChip } from '../CategoryChip';
import { CoverThumb } from './CoverThumb';
import { EmptyState, cn, focusRing } from '../ui';

// Clases de "card accionable": misma superficie que ui/Card + hover sutil (lift
// solo motion-safe), pero como <button> para tener type/semántica correcta.
const CARD_BTN = cn(
  'rounded-2xl border border-line bg-surface shadow-sm p-5',
  'transition-[box-shadow,transform] duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5',
  'flex w-full flex-col gap-3 text-left',
  focusRing,
);

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Otro: CalendarDays, Tertulia: MessagesSquare, Cine: Film, Concierto: Music, Exposición: Image, Taller: Wrench,
};

function barColor(status: ActivityStatus): string {
  return status === 'soon' ? 'bg-brand-accent' : 'bg-brand';
}

export interface ActivitiesGridProps {
  activities: Activity[];
  onView?: (activity: Activity) => void;
}

// Vista GRID de actividades · cards con los MISMOS datos que la tabla (sin datos
// nuevos). Cada card es accionable → abre el detalle (onView). Presentacional.
export function ActivitiesGrid({ activities, onView }: ActivitiesGridProps) {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={CalendarSearch}
        title="Sin actividades"
        description="No hay actividades que coincidan con los filtros aplicados."
      />
    );
  }

  return (
    <div className="app-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {activities.map((a) => {
        const CatIcon = CATEGORY_ICON[a.category] ?? CalendarDays;
        return (
          <button key={a.id} type="button" onClick={() => onView?.(a)} className={CARD_BTN}>
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-surface-container">
              <CoverThumb
                src={a.imageUrl ?? null}
                alt=""
                className="h-full w-full object-cover"
                fallback={
                  <span className="grid h-full w-full place-items-center text-muted">
                    <CatIcon size={28} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                }
              />
            </div>
            <div className="flex items-center justify-end">
              <StatusBadge status={a.status} label={a.statusLabel} />
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold tracking-tight text-ink">{a.title}</p>
              <CategoryChip category={a.category} className="mt-1" />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" className="text-faint" />{a.date}</span>
              <span className="inline-flex items-center gap-1.5 truncate"><MapPin size={14} aria-hidden="true" className="text-faint" />{a.location}</span>
            </div>
            {a.occupancyPct === null ? (
              <span className="text-[12px] text-faint">Sin datos de ocupación</span>
            ) : (
              <div className="mt-auto">
                <div className="flex items-center justify-between text-[12px] text-muted">
                  <span className="tabular-nums">{a.registered} / {a.capacity}</span>
                  <span className="font-semibold tabular-nums text-ink">{a.occupancyPct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                  <div className={`app-bar-grow h-full rounded-full ${barColor(a.status)}`} style={{ width: `${a.occupancyPct}%` }} />
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
