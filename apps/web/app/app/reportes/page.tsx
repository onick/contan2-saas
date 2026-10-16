import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/shell/AppShell';
import { Unavailable } from '../../../components/shell/Unavailable';
import { ReportesDashboard } from '../../../components/reportes/ReportesDashboard';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getPeriodSummary } from '../../../lib/api/reports';
import { getAdminGate } from '../../../lib/auth/session';
import { ErrorState } from '../../../components/ui';
import { REPORT_ROLES } from '../../../lib/shell/nav';

// Reportes · dashboard ejecutivo. Resumen del período + comparación con el
// anterior, todo desde datos REALES (period-summary). Carga inicial server-side
// ("Este mes"); los filtros (períodos/tipos/rango) re-fetchean vía el proxy. El
// layout rico + animaciones GSAP viven en el client component; AppShell intacto.
// Export Excel/PDF reusa la reportería branded existente (/reports/period.*).
export const metadata: Metadata = {
  title: 'Reportes',
  description: 'Resumen ejecutivo de la operación cultural, con comparación de período',
};

export const dynamic = 'force-dynamic';

function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
}

export default async function ReportesPage() {
  const branding = await getTenantBranding();
  const gate = await getAdminGate();
  const role = gate.status === 'ok' ? gate.staff.role : null;
  const canExport = !!role && REPORT_ROLES.has(role);
  const range = thisMonthRange();
  // Sin permiso de reportes (api-v2: 403 en todo /reports salvo el resumen): ni
  // siquiera pedimos el período; estado honesto en vez de KPIs en 0.
  const data = canExport ? await getPeriodSummary(range.from, range.to) : null;

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Reportes" activeKey="reportes">
      <div className="mx-auto w-full max-w-[1500px]">{children}</div>
    </AppShell>
  );

  if (!canExport) {
    return shell(
      <ErrorState
        kind="forbidden"
        title="No tienes permiso para ver Reportes"
        description="Los reportes y su exportación son para propietarios, administradores y el equipo de Puerta. Si crees que es un error, habla con un administrador."
      />,
    );
  }

  if (!data) {
    return shell(<Unavailable inline title="Reportes no disponibles" description="No pudimos calcular el resumen del período. Reintentá en unos segundos." />);
  }

  return shell(<ReportesDashboard initial={data} initialRange={range} canExport />);
}
