'use client';

// «Resumen del período»: los 4 KPIs en UNA tarjeta (REP-U05). En 1440 son 4 celdas con divisores; en 390, una
// grilla 2×2 con celdas de al menos 72 px. Mientras carga, los valores se reemplazan por Skeleton.

import { Calendar, Users, User, TrendingUp } from 'lucide-react';
import type { PeriodSummaryResponse } from '@contan2/contracts';
import { Card, Skeleton, cn } from '../ui';
import { DeltaPct } from '../charts/primitives';
import { DeltaPoints } from './DeltaPoints';
import { fmt } from './shared';

export function ReportesKpis({ data, loading }: { data: PeriodSummaryResponse; loading: boolean }) {
  const k = data.kpis, dl = data.deltas, pr = data.prev;
  // KPIs con valor anterior incorporado (sin panel "Comparación" aparte).
  const kpis = [
    { label: 'Actividades', value: k.activities, prev: pr.activities, delta: dl.activities, tint: 'bg-info-soft text-info-text', Icon: Calendar },
    // Cifra principal = PERSONAS (con acompañantes); los registros (check-ins) quedan como dato secundario (R3, decisión P2).
    { label: 'Personas', value: k.people, prev: pr.people, delta: dl.people, tint: 'bg-success-bg text-success-fg', Icon: Users, sub: `${fmt(k.attendances)} registros` },
    { label: 'Visitantes únicos', value: k.uniqueVisitors, prev: pr.uniqueVisitors, delta: dl.uniqueVisitors, tint: 'bg-chart-4-soft text-chart-4', Icon: User },
    // La ocupación se compara en PUNTOS porcentuales, no en %.
    { label: 'Ocupación promedio', value: k.occupancyPct, prev: pr.occupancyPct, suffix: '%', delta: dl.occupancyPct, deltaPoints: true, tint: 'bg-brand/10 text-brand-text', Icon: TrendingUp },
  ];
  return (
    <section aria-labelledby="rep-resumen" className="mt-5">
      <h2 id="rep-resumen" className="sr-only">Resumen del período</h2>
      <Card padding="none">
        <dl className="grid grid-cols-2 divide-line max-lg:[&>div:nth-child(n+3)]:border-t max-lg:[&>div:nth-child(even)]:border-l lg:grid-cols-4 lg:divide-x">
          {kpis.map((kp) => (
            <div key={kp.label} className="min-h-[88px] min-w-0 border-line p-4">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted">
                <span className={cn('grid h-7 w-7 flex-none place-items-center rounded-lg', kp.tint)}><kp.Icon size={15} strokeWidth={1.9} aria-hidden="true" /></span>
                <span className="min-w-0 truncate">{kp.label}</span>
              </dt>
              <dd className="mt-2">
                {loading ? <Skeleton className="h-8 w-20" /> : (
                  <p className="text-[30px] font-extrabold leading-none tracking-tight text-ink tabular-nums"><span data-count={kp.value}>{fmt(kp.value)}</span>{kp.suffix}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  {kp.deltaPoints ? <DeltaPoints pts={kp.delta} /> : <DeltaPct pct={kp.delta} />}
                  <span className="tabular-nums">{fmt(kp.prev)}{kp.suffix ?? ''} antes</span>
                </div>
                {kp.sub ? <p className="mt-1 text-[11px] text-faint tabular-nums">{kp.sub}</p> : null}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}
