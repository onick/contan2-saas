import type { Metadata } from 'next';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, Play, ChevronDown, CalendarDays, FileText, FileSpreadsheet } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { RecentReports } from '../../../components/reportes/RecentReports';
import { SectionHeader, Button, Card, cn, focusRing } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { REPORT_TEMPLATES, RECENT_REPORTS } from '../../../lib/reportes/demoData';

// RUTA PROVISIONAL del tenant-admin. Reportes ESTÁTICA con datos demo. La
// generación/descarga real se cablea con /api/v2.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Reportes',
  description: 'Generá y descargá reportes de la operación cultural',
};

const FORMAT_CHIP: Record<string, string> = {
  PDF: 'bg-[#fdeaea] text-[#c5221f]',
  Excel: 'bg-success-bg text-success-fg',
};

// Trigger tipo select (foco visible, 44px). Abre un menú al cablear /api/v2.
function SelectTrigger({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        className={cn(
          'flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink',
          focusRing,
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {Icon ? <Icon size={15} strokeWidth={1.75} aria-hidden="true" className="flex-none text-faint" /> : null}
          {value}
        </span>
        <ChevronDown size={15} strokeWidth={2} aria-hidden="true" className="flex-none text-faint" />
      </button>
    </label>
  );
}

export default function ReportesPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Reportes" activeKey="reportes">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado */}
        <div className="app-reveal">
          <SectionHeader level={1} title="Reportes" subtitle="Generá y descargá reportes de la operación cultural" />
        </div>

        {/* Generador */}
        <Card padding="lg" className="app-reveal mt-6" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={18} strokeWidth={2} aria-hidden="true" className="text-brand-accent" />
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">Generar reporte</h2>
          </div>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
            <SelectTrigger label="Tipo de reporte" value="Asistencia" />
            <SelectTrigger label="Actividad" value="Todas" />
            <SelectTrigger label="Rango de fechas" value="Últimos 30 días" icon={CalendarDays} />
            <Button className="lg:flex-none">
              <Play size={16} strokeWidth={2.25} aria-hidden="true" /> Generar
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] text-faint">Formato:</span>
            <Button variant="secondary" size="sm">
              <FileText size={15} strokeWidth={1.75} aria-hidden="true" /> PDF
            </Button>
            <Button variant="secondary" size="sm">
              <FileSpreadsheet size={15} strokeWidth={1.75} aria-hidden="true" /> Excel
            </Button>
          </div>
        </Card>

        {/* Plantillas */}
        <h2 className="mb-3 mt-8 text-[17px] font-semibold tracking-tight text-ink">Plantillas de reporte</h2>
        <div className="app-stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {REPORT_TEMPLATES.map((t) => {
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
