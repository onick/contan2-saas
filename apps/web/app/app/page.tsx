import type { Metadata } from 'next';
import { AppShell } from '../../components/shell/AppShell';
import { Container } from '../../components/Container';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { AttendanceChart } from '../../components/dashboard/AttendanceChart';
import { HighlightCard } from '../../components/dashboard/HighlightCard';
import { InsightCard } from '../../components/dashboard/InsightCard';
import { ActivityTable } from '../../components/dashboard/ActivityTable';
import { Icon } from '../../components/icons';
import { getLocalBranding } from '../../lib/branding/config';
import {
  DASHBOARD_METRICS,
  DASHBOARD_PERIOD,
  HIGHLIGHT,
  RECENT_ACTIVITIES,
  ACTIVITIES_MANAGED,
  INSIGHTS,
} from '../../lib/dashboard/demoData';

// RUTA PROVISIONAL del tenant-admin — NO es la URL final. Dashboard ESTÁTICO
// con métricas locales (lib/dashboard/demoData). Auth, datos reales y el
// path/route-groups definitivos llegan con el wiring a /api/v2/*.
export const metadata: Metadata = {
  title: 'Contan2 v2 · tenant admin · dashboard',
  description: 'Dashboard tenant-admin · resumen de operación cultural',
};

export default function TenantAdminDashboard() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Dashboard" meta={DASHBOARD_PERIOD}>
      <Container>
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
            <Icon name="plus" size={18} /> Nueva actividad
          </button>
        </header>

        {/* KPIs · 375:1 · 768:2 · 1280:4 */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {DASHBOARD_METRICS.map((m) => (
            <MetricCard key={m.key} metric={m} />
          ))}
        </div>

        {/* Gráfico (ancho) + destacado */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
          <AttendanceChart />
          <HighlightCard activity={HIGHLIGHT} />
        </div>

        {/* Insights */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {INSIGHTS.map((i) => (
            <InsightCard key={i.key} insight={i} />
          ))}
        </div>

        {/* Actividades recientes */}
        <div className="mt-4">
          <ActivityTable activities={RECENT_ACTIVITIES} managedCount={ACTIVITIES_MANAGED} />
        </div>
      </Container>
    </AppShell>
  );
}
