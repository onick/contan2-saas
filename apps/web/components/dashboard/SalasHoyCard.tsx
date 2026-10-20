import Link from 'next/link';
import { DoorOpen, ArrowRight } from 'lucide-react';
import { Card, cn, focusRing } from '../ui';
import { numero } from '../../lib/format';

export interface SalasHoyData {
  people: number;
  entries: number;
  salas: Array<{ id: string; name: string; people: number }>;
}

// Tarjeta "Salas hoy" (PUE-A02): las salas permanentes viven en Puerta y NO suman
// en los KPIs de eventos del Inicio; aquí se ven aparte, con enlace a Puerta.
export function SalasHoyCard({ data }: { data: SalasHoyData }) {
  return (
    <Card padding="md" data-testid="salas-hoy">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Salas hoy</p>
          <p className="num mt-2 text-3xl font-bold tabular-nums text-ink">
            {numero(data.people)}{' '}
            <span className="text-sm font-semibold text-muted">
              {data.people === 1 ? 'persona' : 'personas'}
            </span>
          </p>
        </div>
        <DoorOpen size={18} strokeWidth={1.75} className="mt-0.5 flex-none text-faint" aria-hidden="true" />
      </div>
      <ul className="mt-3 divide-y divide-line">
        {data.salas.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
            <span className="min-w-0 truncate text-[13px] text-ink">{s.name}</span>
            <span className="num flex-none text-[13px] font-semibold tabular-nums text-muted">{numero(s.people)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/app/puerta"
        className={cn('mt-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-ink hover:underline', focusRing)}
      >
        Abrir Puerta <ArrowRight size={14} strokeWidth={1.9} aria-hidden="true" />
      </Link>
    </Card>
  );
}
