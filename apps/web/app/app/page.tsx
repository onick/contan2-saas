import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '../../components/shell/AppShell';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { FeaturedActivity } from '../../components/dashboard/FeaturedActivity';
import { AttendanceChart } from '../../components/dashboard/AttendanceChart';
import { HighlightCard } from '../../components/dashboard/HighlightCard';
import { TopActivities } from '../../components/dashboard/TopActivities';
import { RecentVisitors } from '../../components/dashboard/RecentVisitors';
import { Plus } from 'lucide-react';
import { SectionHeader, Button, Card, Skeleton } from '../../components/ui';
import { getLocalBranding } from '../../lib/branding/config';
import { getDashboardMetricCards } from '../../lib/api/dashboard';
import {
  DASHBOARD_METRICS,
  DASHBOARD_PERIOD,
  FEATURED_ACTIVITY,
  HIGHLIGHT,
  TOP_ACTIVITIES,
  RECENT_VISITORS,
} from '../../lib/dashboard/demoData';

// RUTA PROVISIONAL del tenant-admin — NO es la URL final. Los KPIs se cablean
// read-only a GET /api/v2/dashboard/metrics (render DINÁMICO por request, vía
// Suspense → el shell aparece al instante y los KPIs streamean con skeleton).
// Si no hay datos reales (sin sesión / api-v2 caído) caen a demoData. El resto
// (destacado, gráfico, top, visitantes) sigue demo: aún no hay endpoints.
export const metadata: Metadata = {
  title: 'Contan2 v2 · tenant admin · dashboard',
  description: 'Dashboard tenant-admin · resumen de operación cultural',
};

const KPI_GRID = 'mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4';

// Sección de KPIs · async (toca cookies()/fetch → dinámica). Streamea dentro de
// <Suspense>; cae a demoData si no hay datos reales.
async function DashboardKpis() {
  const metrics = (await getDashboardMetricCards()) ?? DASHBOARD_METRICS;
  return (
    <div className={KPI_GRID}>
      {metrics.map((m) => (
        <MetricCard key={m.key} metric={m} />
      ))}
    </div>
  );
}

// Skeleton de los KPIs (mismo grid) mientras resuelve el fetch.
function KpiSkeleton() {
  return (
    <div className={KPI_GRID}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} padding="lg" className="flex flex-col items-start gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </Card>
      ))}
    </div>
  );
}

export default function TenantAdminDashboard() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Dashboard" activeKey="dashboard" meta={DASHBOARD_PERIOD}>
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado de la vista + acción primaria */}
        <SectionHeader
          level={1}
          title={branding.name}
          subtitle={`Actividad cultural · ${DASHBOARD_PERIOD.toLowerCase()}`}
          actions={
            <Button>
              <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nueva actividad
            </Button>
          }
        />

        {/* KPIs · reales (read-only) con skeleton de carga · 375:1 · 768:2 · 1280:4 */}
        <Suspense fallback={<KpiSkeleton />}>
          <DashboardKpis />
        </Suspense>

        {/* Actividad próxima destacada (ancho completo) */}
        <div className="mt-4">
          <FeaturedActivity activity={FEATURED_ACTIVITY} />
        </div>

        {/* Gráfico (ancho) + destacado del período */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
          <AttendanceChart />
          <HighlightCard activity={HIGHLIGHT} />
        </div>

        {/* Top actividades + últimos visitantes */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
          <TopActivities activities={TOP_ACTIVITIES} />
          <RecentVisitors visitors={RECENT_VISITORS} />
        </div>
      </div>
    </AppShell>
  );
}
