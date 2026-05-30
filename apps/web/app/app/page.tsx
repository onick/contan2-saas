import type { Metadata } from 'next';
import { AppShell } from '../../components/shell/AppShell';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { FeaturedActivity } from '../../components/dashboard/FeaturedActivity';
import { AttendanceChart } from '../../components/dashboard/AttendanceChart';
import { HighlightCard } from '../../components/dashboard/HighlightCard';
import { TopActivities } from '../../components/dashboard/TopActivities';
import { RecentVisitors } from '../../components/dashboard/RecentVisitors';
import { Plus } from 'lucide-react';
import { getLocalBranding } from '../../lib/branding/config';
import {
  DASHBOARD_METRICS,
  DASHBOARD_PERIOD,
  FEATURED_ACTIVITY,
  HIGHLIGHT,
  TOP_ACTIVITIES,
  RECENT_VISITORS,
} from '../../lib/dashboard/demoData';

// RUTA PROVISIONAL del tenant-admin — NO es la URL final. Dashboard ESTÁTICO
// con datos locales (lib/dashboard/demoData). Auth, datos reales y el
// path/route-groups definitivos llegan con el wiring a /api/v2/*.
export const metadata: Metadata = {
  title: 'Contan2 v2 · tenant admin · dashboard',
  description: 'Dashboard tenant-admin · resumen de operación cultural',
};

export default function TenantAdminDashboard() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Dashboard" meta={DASHBOARD_PERIOD}>
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado de la vista + acción primaria */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              Resumen de operación
            </p>
            <h1 className="mt-1.5 text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">
              {branding.name}
            </h1>
            <p className="mt-1 text-muted">Actividad cultural · {DASHBOARD_PERIOD.toLowerCase()}</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
          >
            <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nueva actividad
          </button>
        </header>

        {/* KPIs · 375:1 · 768:2 · 1280:4 */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {DASHBOARD_METRICS.map((m) => (
            <MetricCard key={m.key} metric={m} />
          ))}
        </div>

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
