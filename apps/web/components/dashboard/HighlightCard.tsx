import type { HighlightActivity } from '../../lib/dashboard/demoData';

export interface HighlightCardProps {
  activity: HighlightActivity;
}

// Caso destacado del período. La barra de ocupación es un <div> simple (no
// librería de charts) con width inline = occupancyPct. Server Component.
export function HighlightCard({ activity }: HighlightCardProps) {
  const pct = Math.max(0, Math.min(100, activity.occupancyPct));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Destacado</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900 md:text-xl">{activity.title}</h3>

      <p className="mt-3 text-2xl font-bold tabular-nums text-brand">
        {activity.registered}
        <span className="text-base font-medium text-slate-400"> / {activity.capacity}</span>
      </p>
      <p className="text-sm text-slate-600">{pct}% de ocupación</p>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Ocupación de ${activity.title}`}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
