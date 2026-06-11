import type { Metadata } from 'next';
import { AppShell } from '../../../components/shell/AppShell';
import { AttendanceReport } from '../../../components/reportes/AttendanceReport';
import { PeriodReport } from '../../../components/reportes/PeriodReport';
import { ActivityReportCard, type ReportableActivity } from '../../../components/reportes/ActivityReportCard';
import { SectionHeader } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { getActivitiesView } from '../../../lib/api/activities';

// Reportes · SOLO superficies reales (auditoría 2026-06-10: se retiraron las
// plantillas demo con botones "Generar" inertes y los "reportes recientes"
// fake con Descargar href="#" — regla del proyecto: cero controles muertos en
// superficies visibles). El generador "Asistencia por actividad" es REAL
// (api-v2 vía BFF). Reportería PDF/Excel branded por actividad y por período
// (paridad v1 /reports/*) es el siguiente bloque del roadmap (S2) — avisado
// abajo sin fingir que existe.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Reportes',
  description: 'Generá y descargá reportes de la operación cultural',
};

export default async function ReportesPage() {
  const branding = getLocalBranding();
  const view = await getActivitiesView();
  const reportables: ReportableActivity[] = (view?.activities ?? [])
    .filter((a) => a.statusRaw) // sólo reales (id reportable)
    .map((a) => ({ id: a.id, title: a.title, date: a.date }));

  return (
    <AppShell branding={branding} title="Reportes" activeKey="reportes">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Reportes" subtitle="Generá y descargá reportes de la operación cultural" />
        </div>

        {/* S2 · Informe de período (preview con deltas + Excel/PDF branded) */}
        <PeriodReport />

        {/* S2 · Informe por actividad (Excel/PDF branded) */}
        <ActivityReportCard activities={reportables} />

        {/* Export operativo · Asistencia por actividad (csv/xlsx/pdf tabular) */}
        <AttendanceReport />
      </div>
    </AppShell>
  );
}
