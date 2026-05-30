import type { ActivitySummary } from '../../lib/dashboard/demoData';

export interface ActivityListProps {
  activities: ActivitySummary[];
  // Cantidad total gestionada (va en el encabezado de la sección).
  managedCount: number;
}

// Tabla editorial de actividades recientes · estilo Geist/Vercel: columnas
// tituladas (md+), categoría en chip tenue, hairlines. Mobile = filas apiladas
// (título sobre chip). Server Component.
export function ActivityList({ activities, managedCount }: ActivityListProps) {
  return (
    <section className="rounded-xl border border-line bg-white p-5 md:p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold tracking-tight text-ink">Actividades recientes</h3>
        <p className="text-xs text-faint">
          <span className="font-semibold tabular-nums text-muted">{managedCount}</span> en gestión
        </p>
      </div>

      {/* Encabezado de columnas (solo md+) */}
      <div className="mt-4 hidden grid-cols-[1fr_auto] gap-3 border-b border-line pb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint md:grid">
        <span>Actividad</span>
        <span>Categoría</span>
      </div>

      <ul>
        {activities.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-1.5 border-t border-line py-3.5 first:border-t-0 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-3"
          >
            <span className="text-sm font-medium tracking-tight text-ink">{a.title}</span>
            <span className="justify-self-start rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted md:justify-self-end">
              {a.category}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
