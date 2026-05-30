import { CalendarDays, Clock, MapPin, Eye, Mail, FileText } from 'lucide-react';
import type { FeaturedActivity as FeaturedActivityData } from '../../lib/dashboard/demoData';
import { CategoryChip } from '../CategoryChip';

export interface FeaturedActivityProps {
  activity: FeaturedActivityData;
}

// Actividad próxima destacada · card ancha estilo "hero" con miniatura
// (placeholder honesto: no hay asset de póster todavía), badge de estado,
// fecha/lugar/categoría, barra de inscripción y acciones. Server Component.
export function FeaturedActivity({ activity }: FeaturedActivityProps) {
  const pct = Math.max(0, Math.min(100, activity.occupancyPct));

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4 shadow-sm md:flex-row md:items-center md:p-5">
      {/* Miniatura (placeholder hasta tener el póster real) */}
      <div
        aria-hidden="true"
        className="grid h-36 w-full flex-none place-items-center rounded-xl bg-gradient-to-br from-brand-accent to-brand text-white md:h-24 md:w-40"
      >
        <CalendarDays size={30} strokeWidth={1.75} aria-hidden="true" />
      </div>

      {/* Detalle */}
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[#b35400]">
          <Clock size={14} strokeWidth={2} aria-hidden="true" /> {activity.startsLabel}
        </span>
        <h3 className="mt-2 truncate text-[18px] font-semibold tracking-tight text-ink">
          {activity.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={15} strokeWidth={1.75} aria-hidden="true" className="text-faint" /> {activity.date}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={15} strokeWidth={1.75} aria-hidden="true" className="text-faint" /> {activity.location}
          </span>
          <CategoryChip category={activity.category} />
        </div>

        {/* Inscripción */}
        <div className="mt-3 max-w-md">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span className="tabular-nums">{activity.registered} / {activity.capacity} inscritos</span>
            <span className="font-semibold tabular-nums text-ink">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
            <div className="h-full rounded-full bg-brand-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-none flex-col gap-2 md:w-40">
        <button type="button" className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand px-4 py-2 text-[13px] font-semibold text-white shadow-sm">
          <Eye size={16} strokeWidth={2} aria-hidden="true" /> Ver detalle
        </button>
        <button type="button" className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-muted">
          <Mail size={16} strokeWidth={2} aria-hidden="true" /> Invitar
        </button>
        <button type="button" className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-muted">
          <FileText size={16} strokeWidth={2} aria-hidden="true" /> Reporte
        </button>
      </div>
    </section>
  );
}
