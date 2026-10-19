'use client';

// Gráficas del dashboard de Reportes: Evolución, Por tipo, Visitantes y «Cuándo viene la gente» (por hora / por día
// en una sola tarjeta con control segmentado). Cada tarjeta se oculta desde el dashboard cuando todo vale 0.

import { useState } from 'react';
import { Clock } from 'lucide-react';
import type { PeriodSummaryResponse } from '@contan2/contracts';
import { Card, SegmentedControlClient } from '../ui';
import { buildSlices, Donut, Bars, LineChart } from '../charts/primitives';
import { TYPE_COLOR, WEEKDAYS } from './shared';

const H2 = 'text-[15.5px] font-bold tracking-tight text-ink';

export function EvolutionCard({ data, range }: { data: PeriodSummaryResponse; range: { from: string; to: string } }) {
  return (
    <Card padding="lg">
      <h2 className={H2}>Evolución de asistencias</h2>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        <span><i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-sm align-middle" style={{ background: '#e65100' }} />Este período ({range.from} – {range.to})</span>
        <span><i className="mr-1.5 inline-block h-[3px] w-3.5 rounded-sm align-middle" style={{ background: '#c7ccd4' }} />Período anterior ({data.prevRange.from} – {data.prevRange.to})</span>
      </div>
      <LineChart daily={data.daily} tooltipExtra={(i) => [
        { c: '#7c3aed', l: 'Visitantes únicos', v: data.daily[i]!.visitors },
        { c: '#1d7aa7', l: 'Actividades', v: data.daily[i]!.activities },
      ]} />
    </Card>
  );
}

export function ByTypeCard({ data }: { data: PeriodSummaryResponse }) {
  const slices = buildSlices(data.byType.map((t) => ({ label: t.label, count: t.attendances, color: TYPE_COLOR[t.type] ?? '#94a3b8' })));
  return (
    <Card padding="lg">
      <h2 className={H2}>Por tipo de actividad</h2>
      <Donut slices={slices} centerValue={data.kpis.attendances} centerLabel="Total" />
    </Card>
  );
}

export function VisitorsCard({ data }: { data: PeriodSummaryResponse }) {
  const nr = data.newVsReturning;
  const slices = buildSlices([{ label: 'Nuevos', count: nr.nuevos, color: '#e65100' }, { label: 'Recurrentes', count: nr.recurrentes, color: '#9fd8cf' }]);
  return (
    <Card padding="lg">
      <h2 className={H2}>Visitantes</h2>
      <p className="text-[12px] text-muted">Nuevos vs. recurrentes</p>
      <Donut slices={slices} centerValue={nr.nuevos + nr.recurrentes} centerLabel="Únicos" />
    </Card>
  );
}

export const hasHourData = (d: PeriodSummaryResponse) => d.byHour.some((h) => h.count > 0);
export const hasWeekdayData = (d: PeriodSummaryResponse) => d.byWeekday.some((w) => w.count > 0);

export function WhenCard({ data }: { data: PeriodSummaryResponse }) {
  const hourOk = hasHourData(data), dayOk = hasWeekdayData(data);
  const [view, setView] = useState<'hora' | 'dia'>(hourOk ? 'hora' : 'dia');
  // Eje de horas CONTINUO: rellena las horas sin asistencias entre la primera y
  // la última con datos (en vez de saltarlas) para no falsear la distribución.
  const hourItems = (() => {
    if (data.byHour.length === 0) return [] as Array<{ label: string; value: number }>;
    const lo = Math.min(...data.byHour.map((h) => h.hour));
    const hi = Math.max(...data.byHour.map((h) => h.hour));
    const m = new Map(data.byHour.map((h) => [h.hour, h.count]));
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ label: `${lo + i}h`, value: m.get(lo + i) ?? 0 }));
  })();
  const hourMax = Math.max(1, ...hourItems.map((h) => h.value));
  const wdItems = data.byWeekday.map((w) => ({ label: WEEKDAYS[w.weekday] ?? '', value: w.count }));
  const wdMax = Math.max(1, ...wdItems.map((w) => w.value));
  const showing = view === 'hora' && hourOk ? 'hora' : dayOk ? 'dia' : 'hora';

  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`${H2} flex items-center gap-1.5`}><Clock size={15} strokeWidth={2} className="text-faint" aria-hidden="true" /> Cuándo viene la gente</h2>
        {hourOk && dayOk ? (
          <SegmentedControlClient
            items={[{ label: 'Por hora', value: 'hora' }, { label: 'Por día', value: 'dia' }]}
            value={showing} onChange={(v) => setView(v as 'hora' | 'dia')}
          />
        ) : null}
      </div>
      {showing === 'hora'
        ? <Bars items={hourItems} max={hourMax} color="#e65100" empty="Sin datos por hora todavía." />
        : <Bars items={wdItems} max={wdMax} color="#8fb3ef" empty="Sin datos por día todavía." />}
    </Card>
  );
}
