import { CalendarDays, MessagesSquare, Film, Music, Image, Wrench, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Activity, ActivityStatus } from '../../lib/activities/demoData';
import { StatusBadge } from './StatusBadge';
import { CategoryChip } from '../CategoryChip';

// Ícono por categoría (coherente con lucide).
const CATEGORY_ICON: Record<string, LucideIcon> = {
  Otro: CalendarDays,
  Tertulia: MessagesSquare,
  Cine: Film,
  Concierto: Music,
  Exposición: Image,
  Taller: Wrench,
};

// La barra de ocupación usa naranja para próximas, índigo para el resto.
function barColor(status: ActivityStatus): string {
  return status === 'soon' ? 'bg-brand-accent' : 'bg-brand';
}

export interface ActivitiesTableProps {
  activities: Activity[];
}

// Tabla de actividades · estilo Google/Material: columnas tituladas, ícono por
// categoría, chip de estado, barra de ocupación, acciones. En mobile se ocultan
// Fecha/Lugar/Estado (queda Actividad + Ocupación). Server Component.
export function ActivitiesTable({ activities }: ActivitiesTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <th className="px-5 py-3 md:px-6">Actividad</th>
              <th className="hidden px-4 py-3 lg:table-cell">Fecha</th>
              <th className="hidden px-4 py-3 lg:table-cell">Lugar</th>
              <th className="hidden px-4 py-3 md:table-cell">Estado</th>
              <th className="px-4 py-3">Ocupación</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => {
              const CatIcon = CATEGORY_ICON[a.category] ?? CalendarDays;
              return (
                <tr key={a.id} className="border-t border-line align-middle hover:bg-page">
                  {/* Actividad */}
                  <td className="px-5 py-4 md:px-6">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-surface-container text-muted">
                        <CatIcon size={18} strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tracking-tight text-ink">{a.title}</p>
                        <CategoryChip category={a.category} className="mt-0.5" />
                      </div>
                    </div>
                  </td>
                  {/* Fecha */}
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] text-muted lg:table-cell">{a.date}</td>
                  {/* Lugar */}
                  <td className="hidden px-4 py-4 text-[13px] text-muted lg:table-cell">{a.location}</td>
                  {/* Estado */}
                  <td className="hidden px-4 py-4 md:table-cell">
                    <StatusBadge status={a.status} label={a.statusLabel} />
                  </td>
                  {/* Ocupación */}
                  <td className="px-4 py-4">
                    {a.occupancyPct === null ? (
                      <span className="text-sm text-faint">—</span>
                    ) : (
                      <div className="w-40">
                        <div className="flex items-center justify-between text-[12px] text-muted">
                          <span className="tabular-nums">{a.registered} / {a.capacity}</span>
                          <span className="font-semibold tabular-nums text-ink">{a.occupancyPct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                          <div className={`h-full rounded-full ${barColor(a.status)}`} style={{ width: `${a.occupancyPct}%` }} />
                        </div>
                      </div>
                    )}
                  </td>
                  {/* Acciones */}
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    <a href="#" className="text-[13px] font-semibold text-brand">Ver</a>
                    <button type="button" aria-label="Más acciones" className="ml-2 align-middle text-faint hover:text-muted">
                      <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
