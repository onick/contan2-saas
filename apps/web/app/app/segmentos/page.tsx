import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/shell/AppShell';
import { Unavailable } from '../../../components/shell/Unavailable';
import { SegmentsDashboard } from '../../../components/segmentos/SegmentsDashboard';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getSegments } from '../../../lib/api/segments';

// Segmentos · dashboard de audiencia por AFINIDAD (paridad v1 insights/segments).
// Conteos EN VIVO del historial real de asistencias: engagement (VIP/activos/
// nuevos/dormidos), fans por TIPO (donut de distribución) y por CATEGORÍA/ciclo.
// Sin demo: API caída → Unavailable. El layout rico + animaciones GSAP viven en
// el componente cliente SegmentsDashboard; el sidebar/AppShell NO se tocan.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Segmentos',
  description: 'Audiencia por afinidad, con conteos en tiempo real',
};

export const dynamic = 'force-dynamic';

export default async function SegmentosPage() {
  const branding = await getTenantBranding();
  const data = await getSegments();

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Segmentos" activeKey="segmentos">
      <div className="mx-auto w-full max-w-[1500px]">{children}</div>
    </AppShell>
  );

  if (!data) {
    return shell(
      <Unavailable inline title="Segmentos no disponibles" description="No pudimos calcular los segmentos. Reintentá en unos segundos." />,
    );
  }

  return shell(<SegmentsDashboard segments={data.segments} totalVisitors={data.totalVisitors} />);
}
