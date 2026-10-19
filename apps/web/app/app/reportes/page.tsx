import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/shell/AppShell';
import { Unavailable } from '../../../components/shell/Unavailable';
import { ReportesDashboard } from '../../../components/reportes/ReportesDashboard';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getPeriodSummary } from '../../../lib/api/reports';
import { getAdminGate } from '../../../lib/auth/session';
import { ErrorState } from '../../../components/ui';
import { REPORT_EXPORT_ROLES, REPORT_ROLES } from '../../../lib/shell/nav';
import { parseReportFilters } from '../../../components/reportes/filters';
import { DEFAULT_TZ, todayYmd } from '../../../components/ui/arc/date-range-picker/ymd';

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

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReportesPage({ searchParams }: { searchParams?: Promise<SearchParams> } = {}) {
  const branding = await getTenantBranding();
  const gate = await getAdminGate();
  const role = gate.status === 'ok' ? gate.staff.role : null;
  const canView = !!role && REPORT_ROLES.has(role);
  // Exportar/generar: solo owner/admin/puerta (CAN_GENERATE_REPORTS). operator y
  // consulta ven el dashboard (period-summary es lectura para todo staff) sin botones.
  const canExport = !!role && REPORT_EXPORT_ROLES.has(role);
  // «Hoy» y «Este mes» según la zona del tenant (no la del contenedor: entre 20:00 y 24:00 en RD ya era otro día en UTC).
  // Los filtros de la URL (?from&to&preset&types&categories) se validan; lo inválido cae a «Este mes».
  const filters = parseReportFilters(searchParams ? await searchParams : undefined, todayYmd(DEFAULT_TZ));
  const range = filters.range;
  // Rol confinado (protocolo/biblioteca) o sin sesión: ni siquiera pedimos el
  // período; estado honesto en vez de KPIs en 0.
  const data = canView ? await getPeriodSummary(range.from, range.to, filters.types) : null;

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Reportes" activeKey="reportes">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </AppShell>
  );

  if (!canView) {
    return shell(
      <ErrorState
        kind="forbidden"
        title="No tienes permiso para ver Reportes"
        description="Los reportes son para propietarios, administradores, operadores, consulta y el equipo de Puerta. Si crees que es un error, habla con un administrador."
      />,
    );
  }

  if (!data) {
    return shell(<Unavailable inline title="Reportes no disponibles" description="No pudimos calcular el resumen del período. Reintenta en unos segundos." />);
  }

  return shell(<ReportesDashboard initial={data} initialRange={range} canExport={canExport} initialFilters={{ preset: filters.preset, types: filters.types, categories: filters.categories }} />);
}
