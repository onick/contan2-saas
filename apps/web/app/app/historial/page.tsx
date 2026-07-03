import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/shell/AppShell';
import { Unavailable } from '../../../components/shell/Unavailable';
import { HistorialDashboard } from '../../../components/historial/HistorialDashboard';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getAuditOverview } from '../../../lib/api/audit';

// Historial y auditoría · dashboard elevado. KPIs (overview) + donut por tipo +
// actividad sospechosa + usuarios más activos + timeline real (AuditTimeline con
// tabs). Todo desde tenant_audit_log. El árbitro RBAC es api-v2: el overview viene
// null si el rol no es owner/admin → estado honesto. AppShell intacto.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Historial',
  description: 'Registro de actividad y auditoría de la organización',
};

export const dynamic = 'force-dynamic';

export default async function HistorialPage() {
  const branding = await getTenantBranding();
  const overview = await getAuditOverview();

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Historial" activeKey="historial">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </AppShell>
  );

  if (!overview) {
    return shell(
      <Unavailable
        inline
        title="Acceso restringido"
        description="El historial de auditoría es para propietarios y administradores. Si creés que es un error, pedile acceso a un administrador."
      />,
    );
  }

  return shell(<HistorialDashboard initialOverview={overview} />);
}
