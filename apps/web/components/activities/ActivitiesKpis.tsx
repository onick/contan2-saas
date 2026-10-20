import { CalendarDays, CalendarClock, TrendingUp } from 'lucide-react';
import { KpiHero } from '../dashboard/KpiHero';

// Fila de 3 KPI de /app/actividades (misma familia visual que el Inicio, vía KpiHero):
// total con barra de distribución · activas con pastilla de estado · ocupación con barra de progreso.
// Sin variación vs período (no hay comparación). Server-safe: solo recibe números.
export interface ActivitiesKpisProps {
  total: number;
  activas: number;
  finalizadas: number;
  canceladas: number;
  // 0-100.
  avgOccupancyPct: number;
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function ActivitiesKpis({ total, activas, finalizadas, canceladas, avgOccupancyPct }: ActivitiesKpisProps) {
  const parts = [
    { key: 'activas', n: activas, text: plural(activas, 'activa', 'activas'), cls: 'bg-[var(--chart-1)]' },
    { key: 'finalizadas', n: finalizadas, text: plural(finalizadas, 'finalizada', 'finalizadas'), cls: 'bg-[var(--chart-2)]' },
    { key: 'canceladas', n: canceladas, text: plural(canceladas, 'cancelada', 'canceladas'), cls: 'bg-white/25' },
  ];
  const sum = parts.reduce((acc, p) => acc + p.n, 0);
  const pct = Math.max(0, Math.min(100, Math.round(avgOccupancyPct)));

  return (
    <div className="app-stagger mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1.5fr_1fr_1fr]">
      <KpiHero
        tone="dark"
        label="Total de actividades"
        value={String(total)}
        icon={CalendarDays}
        iconPlacement="corner"
        aside={
          <div data-testid="kpi-distribution">
            <div
              role="img"
              aria-label={parts.map((p) => p.text).join(', ')}
              className="flex h-1.5 w-full gap-1 overflow-hidden rounded-full"
            >
              {sum > 0
                ? parts.filter((p) => p.n > 0).map((p) => (
                    <span key={p.key} className={`h-full rounded-full ${p.cls}`} style={{ flexGrow: p.n, flexBasis: 0 }} />
                  ))
                : <span className="h-full w-full rounded-full bg-white/25" />}
            </div>
            <p className="mt-2 text-[12px] text-accent-strong-fg/85">{parts.map((p) => p.text).join(' · ')}</p>
          </div>
        }
      />
      <KpiHero
        tone="warm"
        label="Activas"
        value={String(activas)}
        icon={CalendarClock}
        iconPlacement="corner"
        footer={
          <div className="flex justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-white px-3 py-1 text-[12px] font-medium text-ink">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${activas > 0 ? 'bg-success-fg' : 'bg-faint'}`} />
              {activas > 0 ? 'Activa' : 'Sin activas'}
            </span>
          </div>
        }
      />
      <KpiHero
        tone="neutral"
        label="Ocupación promedio"
        value={`${pct}%`}
        icon={TrendingUp}
        iconPlacement="corner"
        footer={
          <div
            role="progressbar"
            aria-label="Ocupación promedio"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container"
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        }
      />
    </div>
  );
}
