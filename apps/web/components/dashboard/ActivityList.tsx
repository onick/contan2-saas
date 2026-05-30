import type { ActivitySummary } from '../../lib/dashboard/demoData';

export interface ActivityListProps {
  activities: ActivitySummary[];
  // Cantidad total gestionada (va en el encabezado de la sección).
  managedCount: number;
}

// Lista responsive de actividades recientes: mobile = filas apiladas
// (título sobre categoría); md+ = fila horizontal título ↔ categoría. Sin
// <table> para evitar overflow en mobile. Server Component.
export function ActivityList({ activities, managedCount }: ActivityListProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
        <h3 className="text-lg font-semibold text-slate-900 md:text-xl">Actividades recientes</h3>
        <p className="text-sm text-slate-500">
          <span className="font-semibold tabular-nums text-slate-700">{managedCount}</span>{' '}
          actividades administradas
        </p>
      </div>

      <ul className="mt-4 divide-y divide-slate-100">
        {activities.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-1 py-3 md:flex-row md:items-center md:justify-between"
          >
            <span className="text-sm font-medium text-slate-900 md:text-base">{a.title}</span>
            <span className="text-xs text-slate-500 md:text-sm">{a.category}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
