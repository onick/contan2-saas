import type { ActivitySummary, ActivityStatus } from '../../lib/dashboard/demoData';
import { Icon } from '../icons';

export interface ActivityTableProps {
  activities: ActivitySummary[];
  managedCount: number;
}

const STATUS_STYLE: Record<ActivityStatus, { dot: string; text: string }> = {
  done: { dot: 'bg-[#9aa0ad]', text: 'text-muted' },
  live: { dot: 'bg-success-fg', text: 'text-success-fg' },
  soon: { dot: 'bg-brand-accent', text: 'text-[#b35400]' },
};

// Tabla de actividades recientes · estilo Google/Material: columnas tituladas,
// chip de categoría, estado con punto de color, barra de ocupación. En mobile
// se ocultan las columnas Categoría/Estado (queda Actividad + Ocupación).
// Server Component.
export function ActivityTable({ activities, managedCount }: ActivityTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 md:px-6">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">Actividades recientes</h3>
        <p className="text-xs text-faint">
          <span className="font-semibold tabular-nums text-muted">{managedCount}</span> en gestión
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-t border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
            <th className="px-5 py-2.5 md:px-6">Actividad</th>
            <th className="hidden px-6 py-2.5 md:table-cell">Categoría</th>
            <th className="hidden px-6 py-2.5 md:table-cell">Estado</th>
            <th className="px-5 py-2.5 text-right md:px-6">Ocupación</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => {
            const st = STATUS_STYLE[a.status];
            return (
              <tr key={a.id} className="border-t border-line align-middle">
                <td className="px-5 py-4 text-sm font-medium tracking-tight text-ink md:px-6">{a.title}</td>
                <td className="hidden px-6 py-4 md:table-cell">
                  <span className="inline-flex rounded-lg bg-surface-container px-2.5 py-1 text-xs text-muted">
                    {a.category}
                  </span>
                </td>
                <td className="hidden px-6 py-4 md:table-cell">
                  <span className={`inline-flex items-center gap-2 text-xs font-semibold ${st.text}`}>
                    <span className={`h-[7px] w-[7px] rounded-full ${st.dot}`} />
                    {a.statusLabel}
                  </span>
                </td>
                <td className="px-5 py-4 text-right md:px-6">
                  {a.occupancyPct === null ? (
                    <span className="text-sm text-faint">—</span>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-2.5">
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-container sm:block">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${a.occupancyPct}%` }} />
                      </span>
                      <span className="min-w-[38px] text-right text-sm font-semibold tabular-nums text-ink">
                        {a.occupancyPct}%
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border-t border-line px-5 py-3 md:px-6">
        <a href="#" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
          Ver todas <Icon name="chevronRight" size={16} />
        </a>
      </div>
    </section>
  );
}
