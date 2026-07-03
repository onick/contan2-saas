import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QrCode, BarChart3 } from 'lucide-react';
import { AppShell } from '../../components/shell/AppShell';
import { RecentVisitors } from '../../components/dashboard/RecentVisitors';
import { PeriodPills, InsightBanner, AttendanceHero, KpiCard, UpcomingCard, TopActivitiesCard, PERIOD_LABEL } from '../../components/dashboard/Overview';
import { NewActivityButton } from '../../components/activities/NewActivityButton';
import { Card, Skeleton, cn, focusRing } from '../../components/ui';
import { Unavailable } from '../../components/shell/Unavailable';
import { DemoBanner } from '../../components/shell/DemoBanner';
import { getTenantBranding } from '../../lib/branding/tenant';
import { isDemoFallbackAllowed } from '../../lib/auth/demo';
import { getDashboardOverview, getRecentVisitors } from '../../lib/api/dashboard';
import { RECENT_VISITORS } from '../../lib/dashboard/demoData';

// Dashboard REAL período-aware (S2 · paridad v1 y mejor): saludo + acciones
// rápidas, selector de período (URL fuente de verdad), alertas operativas
// (insights), hero de asistencias con sparkline + delta vs período anterior,
// KPIs con delta (nuevos/ocupación/retorno), próxima actividad con countdown y
// portada, destacada real del período y últimos visitantes. Sin datos demo en
// las secciones cableadas; API caída → indisponibilidad honesta.
export const metadata: Metadata = {
  title: 'Contan2 v2 · tenant admin · dashboard',
  description: 'Dashboard tenant-admin · resumen de operación cultural',
};

export const dynamic = 'force-dynamic';

const TZ = 'America/Santo_Domingo';
function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
const fmtToday = new Intl.DateTimeFormat('es', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Sección de datos · async (streamea en <Suspense>); el shell pinta al instante.
async function OverviewData({ period }: { period: string }) {
  const data = await getDashboardOverview(period);
  if (!data) {
    return <Unavailable inline title="Dashboard no disponible" description="No pudimos cargar las métricas. Reintentá en unos segundos." />;
  }
  const label = PERIOD_LABEL[data.period];
  return (
    <>
      {/* Alertas operativas del período (paridad v1) */}
      {data.insights.length ? (
        <div className="mt-4 space-y-2">
          {data.insights.map((i) => <InsightBanner key={i.type} insight={i} />)}
        </div>
      ) : null}

      {/* Hero asistencias (sparkline + delta) + KPIs laterales con delta */}
      <div className="app-reveal mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <AttendanceHero data={data} period={label} />
        {/* KPIs: UNA fila en tablet (sm/md); columna lateral en xl */}
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <KpiCard label="Visitantes nuevos" value={data.newVisitors.current.toLocaleString('en-US')} metric={data.newVisitors} help="Altas de visitantes en el período" />
          <KpiCard label="Ocupación promedio" value={String(data.avgOccupancyPct.current)} suffix="%" metric={data.avgOccupancyPct} help="Promedio de inscritos/cupo de las actividades del período" />
          <KpiCard label="Tasa de retorno" value={String(data.returnRatePct.current)} suffix="%" metric={data.returnRatePct} help="Asistencias de visitantes con más de una visita" />
        </div>
      </div>

      {/* Próxima actividad (countdown + portada) */}
      {data.upcoming ? (
        <div className="app-reveal mt-4" style={{ animationDelay: '120ms' }}>
          <UpcomingCard activity={data.upcoming} />
        </div>
      ) : null}

      {/* Resumen TOP de actividades del período + últimos visitantes reales */}
      <div className="app-reveal mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_1fr]" style={{ animationDelay: '180ms' }}>
        {data.topActivities.length > 0 ? <TopActivitiesCard activities={data.topActivities} period={label} /> : <div className="hidden xl:block" />}
        <Suspense fallback={<RecentVisitorsSkeleton />}>
          <RecentVisitorsData />
        </Suspense>
      </div>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
      <Card padding="lg"><Skeleton className="h-3 w-32" /><Skeleton className="mt-3 h-9 w-24" /><Skeleton className="mt-4 h-28 w-full" /></Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} padding="md"><Skeleton className="h-3 w-28" /><Skeleton className="mt-2 h-8 w-20" /></Card>
        ))}
      </div>
    </div>
  );
}

// Últimos visitantes · async (GET /api/v2/users, recientes).
async function RecentVisitorsData() {
  const real = await getRecentVisitors();
  if (!real && !isDemoFallbackAllowed()) {
    return <Unavailable inline title="Visitantes no disponibles" description="No pudimos cargar los últimos visitantes." />;
  }
  return <RecentVisitors visitors={real ?? RECENT_VISITORS} />;
}

function RecentVisitorsSkeleton() {
  return (
    <Card padding="none" className="min-w-0">
      <div className="px-5 py-4 md:px-6"><Skeleton className="h-4 w-32" /><Skeleton className="mt-1.5 h-3 w-24" /></div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-line px-5 py-3 md:px-6">
          <Skeleton className="h-9 w-9 flex-none rounded-full" />
          <div className="flex-1"><Skeleton className="h-3.5 w-32" /><Skeleton className="mt-1.5 h-3 w-40" /></div>
          <Skeleton className="ml-auto h-5 w-14 rounded-full" />
        </div>
      ))}
    </Card>
  );
}

export default async function TenantAdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rawPeriod = typeof sp.period === 'string' ? sp.period : '30d';
  const period = rawPeriod in PERIOD_LABEL ? (rawPeriod as keyof typeof PERIOD_LABEL) : '30d';
  const branding = await getTenantBranding();

  return (
    <AppShell branding={branding} title="Dashboard" activeKey="dashboard" meta={PERIOD_LABEL[period]}>
      <div className="mx-auto w-full max-w-[1600px]">
        {isDemoFallbackAllowed() ? <DemoBanner /> : null}

        {/* Saludo (paridad v1) + acciones rápidas */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{greeting()} 👋</h1>
            <p className="mt-0.5 text-sm text-muted">{cap(fmtToday.format(new Date()))} · {branding.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/app/check-in" className={cn('inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-muted hover:bg-page hover:text-ink', focusRing)}>
              <QrCode size={16} strokeWidth={2} aria-hidden="true" /> Check-in
            </a>
            <a href="/app/reportes" className={cn('inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-muted hover:bg-page hover:text-ink', focusRing)}>
              <BarChart3 size={16} strokeWidth={2} aria-hidden="true" /> Generar reporte
            </a>
            <NewActivityButton />
          </div>
        </div>

        {/* Selector de período · la URL es la fuente de verdad */}
        <div className="mt-4">
          <PeriodPills active={period} />
        </div>

        <Suspense key={period} fallback={<OverviewSkeleton />}>
          <OverviewData period={period} />
        </Suspense>
      </div>
    </AppShell>
  );
}
