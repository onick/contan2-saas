import type { HighlightActivity } from '../../lib/dashboard/demoData';

export interface HighlightCardProps {
  activity: HighlightActivity;
}

// Caso destacado del período · estilo editorial Geist/Vercel. El ratio va en
// Geist Mono; la barra de ocupación es un <div> simple (sin librería de
// charts) en color de marca. Server Component.
export function HighlightCard({ activity }: HighlightCardProps) {
  const pct = Math.max(0, Math.min(100, activity.occupancyPct));

  return (
    <section className="rounded-xl border border-line bg-white p-5 md:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        Actividad destacada
      </p>
      <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-ink">{activity.title}</h3>

      <p className="mt-4 font-mono text-3xl font-semibold tracking-tight tabular-nums text-ink">
        {activity.registered}
        <span className="text-lg font-normal text-faint"> / {activity.capacity}</span>
      </p>
      <p className="mt-1 text-sm text-muted">{pct}% de ocupación</p>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
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
