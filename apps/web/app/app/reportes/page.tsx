import type { Metadata } from 'next';
import { Play } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { RecentReports } from '../../../components/reportes/RecentReports';
import { AttendanceReport } from '../../../components/reportes/AttendanceReport';
import { SectionHeader, Button, Card } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { REPORT_TEMPLATES, RECENT_REPORTS } from '../../../lib/reportes/demoData';

// El generador "Asistencia por actividad" es REAL (api-v2 vía BFF). Las demás
// plantillas y "recientes" siguen como demo hasta que tengan su endpoint.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Reportes',
  description: 'Generá y descargá reportes de la operación cultural',
};

const FORMAT_CHIP: Record<string, string> = {
  PDF: 'bg-[#fdeaea] text-[#c5221f]',
  Excel: 'bg-success-bg text-success-fg',
};

export default function ReportesPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Reportes" activeKey="reportes">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado */}
        <div className="app-reveal">
          <SectionHeader level={1} title="Reportes" subtitle="Generá y descargá reportes de la operación cultural" />
        </div>

        {/* Generador REAL · Asistencia por actividad (api-v2 vía BFF) */}
        <AttendanceReport />

        {/* Plantillas */}
        <h2 className="mb-3 mt-8 text-[17px] font-semibold tracking-tight text-ink">Plantillas de reporte</h2>
        <div className="app-stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {REPORT_TEMPLATES.filter((t) => t.id !== 'asistencia').map((t) => {
            const TplIcon = t.icon;
            return (
              <Card key={t.id} as="article" padding="md" className="flex flex-col">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-[#b35400]">
                  <TplIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-ink">{t.title}</h3>
                <p className="mt-1 flex-1 text-[13px] text-muted">{t.description}</p>
                <div className="mt-3 flex gap-1.5">
                  {t.formats.map((f) => (
                    <span key={f} className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${FORMAT_CHIP[f]}`}>
                      {f}
                    </span>
                  ))}
                </div>
                <Button variant="secondary" size="sm" className="mt-4 w-full">
                  <Play size={15} strokeWidth={2.25} aria-hidden="true" /> Generar
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Recientes */}
        <h2 className="mb-3 mt-8 text-[17px] font-semibold tracking-tight text-ink">Reportes recientes</h2>
        <RecentReports reports={RECENT_REPORTS} />
      </div>
    </AppShell>
  );
}
