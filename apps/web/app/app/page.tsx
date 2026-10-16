import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '../../components/shell/AppShell';
import { InsightBanner, PERIOD_LABEL } from '../../components/dashboard/Overview';
import { NewActivityButton } from '../../components/activities/NewActivityButton';
import { SegmentedControl, Card, Skeleton } from '../../components/ui';
import { StatCardWithInfo } from '../../components/dashboard/StatCardWithInfo';
import { RegistrosChart } from '../../components/dashboard/RegistrosChart';
import { RecentActivity } from '../../components/dashboard/RecentActivity';
import { Unavailable } from '../../components/shell/Unavailable';
import { DemoBanner } from '../../components/shell/DemoBanner';
import { getTenantBranding } from '../../lib/branding/tenant';
import { isDemoFallbackAllowed } from '../../lib/auth/demo';
import { getDashboardOverview } from '../../lib/api/dashboard';
import { fechaHora, numero } from '../../lib/format';
import type { DashboardOverviewResponse } from '@contan2/contracts';

export const metadata: Metadata = { title: 'Inicio' };

export const dynamic = 'force-dynamic';

const KPI_DEFS = {
  attendance: 'Entradas registradas en el periodo',
  newVisitors: 'Personas que se registraron por primera vez en el periodo',
  avgOccupancyPct: 'Promedio de cupos ocupados en las actividades del periodo',
  returnRatePct: 'Asistencias de personas que ya habían venido antes',
} as const;

const toTrend = (deltaPct: number) => ({
  dir: (deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
  value: `${deltaPct > 0 ? '+' : ''}${deltaPct}%`,
  hint: 'vs período anterior',
});

const PERIOD_ITEMS = (active: DashboardOverviewResponse['period']) =>
  (Object.keys(PERIOD_LABEL) as (keyof typeof PERIOD_LABEL)[]).map((p) => ({
    label: PERIOD_LABEL[p],
    href: p === '30d' ? '/app' : `/app?period=${p}`,
    active: p === active,
  }));

async function OverviewData({ period }: { period: string }) {
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
      {data.insights.length > 0 && (
        <div className="mt-4 space-y-2">
          {data.insights.map((i) => <InsightBanner key={i.type} insight={i} />)}
        </div>
      )}

      {/* 4 KPIs */}
      <div className="app-reveal mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCardWithInfo
          label="Asistencias del periodo"
          value={numero(data.attendance.current)}
          trend={toTrend(data.attendance.deltaPct)}
          tooltipText={KPI_DEFS.attendance}
        />
        <StatCardWithInfo
          label="Visitantes nuevos del periodo"
          value={numero(data.newVisitors.current)}
          trend={toTrend(data.newVisitors.deltaPct)}
          tooltipText={KPI_DEFS.newVisitors}
        />
        <StatCardWithInfo
          label="Ocupación promedio del periodo"
          value={`${data.avgOccupancyPct.current}%`}
          trend={toTrend(data.avgOccupancyPct.deltaPct)}
          tooltipText={KPI_DEFS.avgOccupancyPct}
        />
        <StatCardWithInfo
          label="Tasa de retorno del periodo"
          value={`${data.returnRatePct.current}%`}
          trend={toTrend(data.returnRatePct.deltaPct)}
          tooltipText={KPI_DEFS.returnRatePct}
        />
      </div>

      {/* Gráfico + Actividad reciente */}
      <div
        className="app-reveal mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.6fr_1fr]"
        style={{ animationDelay: '60ms' }}
      >
        <RegistrosChart series={data.series} />
        <RecentActivity demoAllowed={isDemoFallbackAllowed()} period={period} />
      </div>

      {/* Próximas actividades */}
      {data.upcoming ? (
        <div className="app-reveal mt-4" style={{ animationDelay: '120ms' }}>
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

function OverviewSkeleton() {
  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} padding="md">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-2 h-4 w-16" />
          </Card>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card padding="lg">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-40 w-full" />
        </Card>
        <Card padding="lg">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-48 w-full" />
        </Card>
      </div>
    </>
  );
}

export default async function TenantAdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawPeriod = typeof sp.period === 'string' ? sp.period : '30d';
  const period = rawPeriod in PERIOD_LABEL
    ? (rawPeriod as keyof typeof PERIOD_LABEL)
    : '30d';
  const branding = await getTenantBranding();

  return (
    <AppShell branding={branding} title="Inicio" activeKey="dashboard">
      <div className="mx-auto w-full max-w-[1600px]">
        {isDemoFallbackAllowed() ? <DemoBanner /> : null}

        {/* Cabecera */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Inicio</h1>
            <p className="mt-0.5 text-sm text-muted">
              Resumen de {branding.name} · actualizado {fechaHora(new Date())}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl items={PERIOD_ITEMS(period)} />
            <NewActivityButton />
          </div>
        </div>

        <Suspense key={period} fallback={<OverviewSkeleton />}>
          <OverviewData period={period} />
        </Suspense>
      </div>
    </AppShell>
  );
}
