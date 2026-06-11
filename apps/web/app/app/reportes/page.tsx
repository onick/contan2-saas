import type { Metadata } from 'next';
import { FileBarChart2 } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { AttendanceReport } from '../../../components/reportes/AttendanceReport';
import { SectionHeader } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';

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

export default function ReportesPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Reportes" activeKey="reportes">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
          <SectionHeader level={1} title="Reportes" subtitle="Generá y descargá reportes de la operación cultural" />
        </div>

        {/* Generador REAL · Asistencia por actividad (api-v2 vía BFF) */}
        <AttendanceReport />

        <p className="mt-8 flex items-center gap-2 text-[13px] text-faint">
          <FileBarChart2 size={15} strokeWidth={1.75} aria-hidden="true" />
          Próximamente: reportes PDF y Excel con tu marca, por actividad y por período (mensual/anual), como en la versión anterior.
        </p>
      </div>
    </AppShell>
  );
}
