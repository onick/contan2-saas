import { Users, UserPlus } from "lucide-react";
import { Card } from "../ui";
import { AttentionStrip } from "./Overview";
import { KpiHero } from "./KpiHero";
import { RegistrosChart } from "./RegistrosChart";
import { SalasHoyCard } from "./SalasHoyCard";
import { RecentActivity } from "./RecentActivity";
import { Unavailable } from "../shell/Unavailable";
import { PUERTA_ENABLED } from "../../lib/shell/nav";
import { isDemoFallbackAllowed } from "../../lib/auth/demo";
import { getDashboardOverview } from "../../lib/api/dashboard";
import { fechaHora, numero } from "../../lib/format";

const KPI_DEFS = {
  attendance:
    "Personas que entraron en el periodo, con sus acompañantes. Cada persona registrada cuenta una vez, más quienes vienen con ella.",
  newVisitors: "Personas que se registraron por primera vez en el periodo",
  avgOccupancyPct: "Promedio de cupos ocupados en las actividades del periodo",
  returnRatePct: "Asistencias de personas que ya habían venido antes",
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
      {/* Bento a 1440 (xl): dos columnas independientes [1.6fr_1fr].
            · Izquierda: KPIs grandes (protagonista oscura + cálida) → Atención hoy → gráfica.
            · Derecha:   KPIs pequeñas compactas → Actividad reciente → Salas hoy.
          Como las pequeñas son más bajas que las grandes, Actividad reciente arranca más
          arriba que Atención hoy (efecto bento pedido por el dueño 2026-10-20).
          Por debajo de xl las columnas son `contents`: todo cae en una sola rejilla con el
          orden operativo (KPIs → Atención hoy → Salas hoy → gráfica → Actividad reciente),
          de ahí los `order-*` (a 820 los KPIs van 2×2, a 390 en una columna). */}
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr] xl:items-start">
        <div
          className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4"
          data-bento="izquierda"
        >
          <div className="app-stagger order-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiHero
              tone="dark"
              icon={Users}
              label="Asistencias del periodo"
              value={numero(data.attendance.current)}
              secondary={
                data.attendance.records !== undefined &&
                data.attendance.records !== data.attendance.current
                  ? `(${numero(data.attendance.records)} ${data.attendance.records === 1 ? "registro" : "registros"})`
                  : undefined
              }
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
          {data.insights.length > 0 || (PUERTA_ENABLED && data.salasHoy) ? (
            <div
              className="app-reveal order-3 min-w-0"
              style={{ animationDelay: "80ms" }}
            >
              <AttentionStrip insights={data.insights} className="min-w-0" />
            </div>
          ) : null}
          <div
            className="app-reveal order-5 min-w-0"
            style={{ animationDelay: "120ms" }}
          >
            <RegistrosChart series={data.series} />
          </div>
          {/* Próximas actividades: debajo de la gráfica, en la columna izquierda (pedido del dueño 2026-10-20). */}
          {data.upcoming ? (
            <div
              className="app-reveal order-7 min-w-0"
              style={{ animationDelay: "160ms" }}
            >
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
        </div>

        <div
          className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4"
          data-bento="derecha"
        >
          <div className="app-stagger order-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiHero
              tone="neutral"
              compact
              label="Ocupación promedio del periodo"
              value={`${data.avgOccupancyPct.current}%`}
              delta={data.avgOccupancyPct.deltaPct}
              tooltipText={KPI_DEFS.avgOccupancyPct}
            />
            <KpiHero
              tone="neutral"
              compact
              label="Tasa de retorno del periodo"
              value={`${data.returnRatePct.current}%`}
              delta={data.returnRatePct.deltaPct}
              tooltipText={KPI_DEFS.returnRatePct}
            />
          </div>
          <div
            className="app-reveal order-6 min-w-0 xl:order-4"
            style={{ animationDelay: "120ms" }}
          >
            <RecentActivity
              demoAllowed={isDemoFallbackAllowed()}
              period={period}
            />
          </div>
          {PUERTA_ENABLED && data.salasHoy ? (
            <div
              className="app-reveal order-4 min-w-0 xl:order-6"
              style={{ animationDelay: "80ms" }}
            >
              <SalasHoyCard data={data.salasHoy} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
