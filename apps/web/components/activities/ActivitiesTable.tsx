import { CalendarDays, MessagesSquare, Film, Music, Image, Wrench, CalendarSearch, Eye } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Activity, ActivityStatus } from '../../lib/activities/demoData';
import { StatusBadge } from './StatusBadge';
import { CategoryChip } from '../CategoryChip';
import { CoverThumb } from './CoverThumb';
import { ActivityRowMenu } from './ActivityRowMenu';
import { Card, IconButton, EmptyState, cn } from '../ui';

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
  // Abre el detalle read-only (drawer). Opcional → la tabla sigue presentacional.
  onView?: (activity: Activity) => void;
  // Menú ⋯ por fila: editar + transiciones de estado (sólo items reales).
  onEdit?: (activity: Activity) => void;
  onChanged?: () => void;
}

// Tabla de actividades · estilo Google/Material: columnas tituladas, ícono por
// categoría, chip de estado, barra de ocupación, acciones. En mobile se ocultan
// Fecha/Lugar/Estado (queda Actividad + Ocupación).
export function ActivitiesTable({ activities, onView, onEdit, onChanged }: ActivitiesTableProps) {
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
    <Card padding="none" className="overflow-hidden">
      {/* Mobile (<md): tarjetas (la tabla min-w-680 forzaba scroll horizontal). */}
      <ul className="app-stagger md:hidden">
        {activities.map((a) => {
          const CatIcon = CATEGORY_ICON[a.category] ?? CalendarDays;
          return (
            <li key={a.id} onClick={() => onView?.(a)} className={cn('border-t border-line px-4 py-3.5 first:border-t-0 hover:bg-page', onView && 'cursor-pointer')}>
              <div className="flex items-center gap-3">
                <span className="block h-10 w-[68px] flex-none overflow-hidden rounded-lg bg-surface-container">
                  <CoverThumb src={a.imageUrl ?? null} posY={a.imagePosY} alt="" className="h-full w-full object-cover"
                    fallback={<span className="grid h-full w-full place-items-center text-muted"><CatIcon size={18} strokeWidth={1.75} aria-hidden="true" /></span>} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium tracking-tight text-ink">{a.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <CategoryChip category={a.category} />
                    <StatusBadge status={a.status} label={a.statusLabel} />
                  </div>
                </div>
                <div className="flex flex-none items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <IconButton label={`Ver detalle de ${a.title}`} variant="ghost" size="sm" className="text-brand" onClick={() => onView?.(a)}>
                    <Eye size={18} strokeWidth={2} aria-hidden="true" />
                  </IconButton>
                  <ActivityRowMenu activity={a} onView={onView} onEdit={onEdit} onChanged={onChanged} />
                </div>
              </div>
              <div className="mt-2 pl-[56px]">
                {a.occupancyPct !== null ? (
                  <>
                    <div className="flex items-center justify-between text-[12px] text-muted">
                      <span className="tabular-nums">{a.registered} / {a.capacity}</span>
                      <span className="font-semibold tabular-nums text-ink">{a.occupancyPct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
                      <div className={`app-bar-grow h-full rounded-full ${barColor(a.status)}`} style={{ width: `${a.occupancyPct}%` }} />
                    </div>
                  </>
                ) : null}
                <p className="mt-1.5 text-xs text-faint">{a.date} · {a.location}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Tablet/desktop (md+): tabla. */}
      <div className="hidden overflow-x-auto md:block">
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
          <tbody className="app-stagger">
            {activities.map((a) => {
              const CatIcon = CATEGORY_ICON[a.category] ?? CalendarDays;
              return (
                <tr
                  key={a.id}
                  onClick={() => onView?.(a)}
                  className={cn('border-t border-line align-middle hover:bg-page', onView && 'cursor-pointer')}
                >
                  {/* Actividad */}
                  <td className="px-5 py-4 md:px-6">
                    <div className="flex items-center gap-3">
                      <span className="block h-10 w-[68px] flex-none overflow-hidden rounded-lg bg-surface-container">
                        <CoverThumb
                          src={a.imageUrl ?? null}
                          posY={a.imagePosY}
                          alt=""
                          className="h-full w-full object-cover"
                          fallback={
                            <span className="grid h-full w-full place-items-center text-muted">
                              <CatIcon size={18} strokeWidth={1.75} aria-hidden="true" />
                            </span>
                          }
                        />
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
                          <div className={`app-bar-grow h-full rounded-full ${barColor(a.status)}`} style={{ width: `${a.occupancyPct}%` }} />
                        </div>
                      </div>
                    )}
                  </td>
                  {/* Acciones · stopPropagation: el ⋯ y el ojo no deben disparar
                      el click de la fila (que abre el detalle). */}
                  <td className="whitespace-nowrap px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton label={`Ver detalle de ${a.title}`} variant="ghost" size="sm" className="text-brand" onClick={() => onView?.(a)}>
                        <Eye size={18} strokeWidth={2} aria-hidden="true" />
                      </IconButton>
                      <ActivityRowMenu activity={a} onView={onView} onEdit={onEdit} onChanged={onChanged} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
