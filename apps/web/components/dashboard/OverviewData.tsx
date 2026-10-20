import { Users, UserPlus } from 'lucide-react';
import { Card } from '../ui';
import { AttentionStrip } from './Overview';
import { KpiHero } from './KpiHero';
import { RegistrosChart } from './RegistrosChart';
import { SalasHoyCard } from './SalasHoyCard';
import { RecentActivity } from './RecentActivity';
import { Unavailable } from '../shell/Unavailable';
import { PUERTA_ENABLED } from '../../lib/shell/nav';
import { isDemoFallbackAllowed } from '../../lib/auth/demo';
import { getDashboardOverview } from '../../lib/api/dashboard';
import { fechaHora, numero } from '../../lib/format';

const KPI_DEFS = {
  attendance: 'Personas que entraron en el periodo, con sus acompañantes. Cada persona registrada cuenta una vez, más quienes vienen con ella.',
  newVisitors: 'Personas que se registraron por primera vez en el periodo',
  avgOccupancyPct: 'Promedio de cupos ocupados en las actividades del periodo',
  returnRatePct: 'Asistencias de personas que ya habían venido antes',
} as const;

export async function OverviewData({ period }: { period: string }) {
  const data = await getDashboardOverview(period);
  if (!data) {
    return (
      <Unavailable
        inline
        title="Dashboard no disponible"
        description="No pudimos cargar las métricas. Intenta de nuevo en unos segundos."
      />
    );
  }

  return (
    <>
      {/* 4 KPIs con jerarquía: las dos grandes (protagonista oscura + cálida) a la izquierda,
          las dos pequeñas a la derecha. A 1440 (xl) comparten la rejilla [1.6fr_1fr] con la
          gráfica/actividad de abajo; a 820 son 2×2 (grandes arriba); a 390, una columna. */}
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="app-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiHero
            tone="dark"
            icon={Users}
            label="Asistencias del periodo"
            value={numero(data.attendance.current)}
            secondary={data.attendance.records !== undefined && data.attendance.records !== data.attendance.current
              ? `(${numero(data.attendance.records)} ${data.attendance.records === 1 ? 'registro' : 'registros'})` : undefined}
            delta={data.attendance.deltaPct}
            tooltipText={KPI_DEFS.attendance}
          />
          <KpiHero
            tone="warm"
            icon={UserPlus}
            label="Visitantes nuevos del periodo"
            value={numero(data.newVisitors.current)}
            delta={data.newVisitors.deltaPct}
            tooltipText={KPI_DEFS.newVisitors}
          />
        </div>
        <div className="app-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiHero
            tone="neutral"
            label="Ocupación promedio del periodo"
            value={`${data.avgOccupancyPct.current}%`}
            delta={data.avgOccupancyPct.deltaPct}
            tooltipText={KPI_DEFS.avgOccupancyPct}
          />
          <KpiHero
            tone="neutral"
            label="Tasa de retorno del periodo"
            value={`${data.returnRatePct.current}%`}
            delta={data.returnRatePct.deltaPct}
            tooltipText={KPI_DEFS.returnRatePct}
          />
        </div>
      </div>

      {/* Atención hoy: avisos operativos + Salas hoy (viven en Puerta, fuera de los KPIs de
          eventos). A 1440 la franja ocupa la columna ancha y Salas hoy la angosta, justo
          sobre Actividad reciente; a 820/390 se apilan a ancho completo. */}
      {data.insights.length > 0 || (PUERTA_ENABLED && data.salasHoy) ? (
        <div
          className="app-reveal mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.6fr_1fr]"
          style={{ animationDelay: '80ms' }}
        >
          <AttentionStrip insights={data.insights} className="min-w-0" />
          {PUERTA_ENABLED && data.salasHoy ? (
            <SalasHoyCard data={data.salasHoy} />
          ) : null}
        </div>
      ) : null}

      {/* Gráfico + Actividad reciente */}
      <div
        className="app-reveal mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.6fr_1fr]"
        style={{ animationDelay: '120ms' }}
      >
        <RegistrosChart series={data.series} />
        <RecentActivity demoAllowed={isDemoFallbackAllowed()} period={period} />
      </div>

      {/* Próximas actividades */}
      {data.upcoming ? (
        <div className="app-reveal mt-4" style={{ animationDelay: '160ms' }}>
          <Card padding="md">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              Próximas actividades
            </p>
            <ul className="mt-3 divide-y divide-line">
              <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {data.upcoming.name}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {fechaHora(data.upcoming.date)}
                  </p>
                </div>
                <span className="num flex-none text-[13px] font-semibold tabular-nums text-muted">
                  {data.upcoming.enrolledCount} / {data.upcoming.capacity}
                </span>
              </li>
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}
