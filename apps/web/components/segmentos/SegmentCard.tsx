import { MoreHorizontal } from 'lucide-react';
import type { Segment } from '../../lib/segmentos/demoData';

export interface SegmentCardProps {
  segment: Segment;
}

// Tarjeta de segmento · ícono tonal + nombre + chip de tipo, conteo de miembros
// con % de la audiencia (barra naranja), chips de reglas y pie con actualización
// + acciones. Server Component. Solo conteos agregados (sin PII).
export function SegmentCard({ segment }: SegmentCardProps) {
  const SegIcon = segment.icon;
  const pct = Math.max(0, Math.min(100, segment.audiencePct));
  const dynamic = segment.type === 'dinamico';

  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-[#b35400]">
            <SegIcon size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">{segment.name}</h3>
        </div>
        <span
          className={
            'flex-none rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ' +
            (dynamic ? 'bg-accent-soft text-[#b35400]' : 'bg-surface-container text-muted')
          }
        >
          {segment.typeLabel}
        </span>
      </div>

      <p className="mt-3 text-[13px] text-muted">{segment.description}</p>

      <div className="mt-2 flex items-end justify-between">
        <p className="text-3xl font-bold tabular-nums text-ink">{segment.members.toLocaleString('en-US')}</p>
        <p className="text-xs text-faint">
          <span className="font-semibold tabular-nums text-muted">{pct}%</span> de la audiencia
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
        <div className="h-full rounded-full bg-brand-accent" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {segment.rules.map((r) => (
          <span key={r} className="inline-flex rounded-md bg-surface-container px-2 py-0.5 text-[11px] text-muted">
            {r}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="text-[11px] text-faint">{segment.updated}</span>
        <span className="flex items-center gap-2">
          <a href="#" className="text-[13px] font-semibold text-brand">Invitar</a>
          <button type="button" aria-label="Más acciones" className="text-faint hover:text-muted">
            <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      </div>
    </section>
  );
}
