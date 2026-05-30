import type { Metadata } from 'next';
import { AppShell } from '../../components/shell/AppShell';
import { Container } from '../../components/Container';
import { MetricCard } from '../../components/dashboard/MetricCard';
import { HighlightCard } from '../../components/dashboard/HighlightCard';
import { AlertCard } from '../../components/dashboard/AlertCard';
import { ActivityList } from '../../components/dashboard/ActivityList';
import { getLocalBranding } from '../../lib/branding/config';
import {
  DASHBOARD_METRICS,
  DASHBOARD_PERIOD,
  HIGHLIGHT,
  RECENT_ACTIVITIES,
  ACTIVITIES_MANAGED,
  LOW_ENROLLMENT_ALERT,
} from '../../lib/dashboard/demoData';

// RUTA PROVISIONAL del tenant-admin — NO es la URL final. Dashboard ESTÁTICO
// con métricas locales (lib/dashboard/demoData). El wiring real a /api/v2/*
// (auth + datos) + el path/route-groups definitivos llegan después.
export const metadata: Metadata = {
  title: 'Contan2 v2 · tenant admin · dashboard',
  description: 'Dashboard tenant-admin · resumen de operación cultural',
};

export default function TenantAdminDashboard() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Dashboard" meta={DASHBOARD_PERIOD}>
      <Container>
        {/* Encabezado de la vista */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            Resumen de operación
          </p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-ink xl:text-[30px]">
            {branding.name}
          </h1>
          <p className="mt-1.5 max-w-[52ch] text-muted">
            Actividad cultural de los últimos 30 días.
          </p>
        </header>

        {/* Métricas · 375:1 · 768:2 · 1280:4 */}
        <section aria-label={`Resumen · ${DASHBOARD_PERIOD}`}>
          <p className="mb-3.5 mt-8 text-[13px] font-semibold tracking-tight text-ink">
            Resumen del período
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-3.5 xl:grid-cols-4">
            {DASHBOARD_METRICS.map((m) => (
              <MetricCard key={m.key} metric={m} />
            ))}
          </div>
        </section>

        {/* Destacado (más ancho) + aviso */}
        <div className="mt-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-[3fr_2fr]">
          <HighlightCard activity={HIGHLIGHT} />
          <AlertCard alert={LOW_ENROLLMENT_ALERT} />
        </div>

        {/* Actividades recientes */}
        <div className="mt-8">
          <ActivityList activities={RECENT_ACTIVITIES} managedCount={ACTIVITIES_MANAGED} />
        </div>
      </Container>
    </AppShell>
  );
}
