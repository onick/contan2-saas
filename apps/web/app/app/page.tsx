import type { Metadata } from 'next';
import { AppShell } from '../../components/shell/AppShell';
import { BrandHeader } from '../../components/BrandHeader';
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
// con métricas locales (lib/dashboard/demoData). El wiring real a
// /api/v2/* (auth + datos) + el path/route-groups definitivos llegan después.
export const metadata: Metadata = {
  title: 'Contan2 v2 · tenant admin · dashboard',
  description: 'Dashboard tenant-admin estático · métricas locales · ruta provisional /app',
};

export default function TenantAdminDashboard() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Dashboard">
      <Container>
        <BrandHeader branding={branding} />

        {/* Métricas · 375:1 col · 768:2 col · 1280:4 col */}
        <section aria-label={`Resumen · ${DASHBOARD_PERIOD}`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {DASHBOARD_METRICS.map((m) => (
              <MetricCard key={m.key} metric={m} />
            ))}
          </div>
        </section>

        {/* Destacado + alerta · stack en mobile, 2 col desde md */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:mt-8 md:grid-cols-2">
          <HighlightCard activity={HIGHLIGHT} />
          <AlertCard alert={LOW_ENROLLMENT_ALERT} />
        </div>

        {/* Actividades recientes */}
        <div className="mt-6 md:mt-8">
          <ActivityList activities={RECENT_ACTIVITIES} managedCount={ACTIVITIES_MANAGED} />
        </div>
      </Container>
    </AppShell>
  );
}
