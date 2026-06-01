import type { Metadata } from 'next';
import { Sparkles, Play, ChevronDown, CalendarDays, FileText, FileSpreadsheet } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { RecentReports } from '../../../components/reportes/RecentReports';
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

function Select({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{label}</span>
      <span className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] font-medium text-ink">
        <span className="truncate">{value}</span>
        <ChevronDown size={15} strokeWidth={2} aria-hidden="true" className="flex-none text-faint" />
      </span>
    </label>
  );
}

export default function ReportesPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Reportes" activeKey="reportes">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado */}
        <header>
          <h1 className="text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">Reportes</h1>
          <p className="mt-1 text-muted">Generá y descargá reportes de la operación cultural</p>
        </header>

        {/* Generador */}
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={18} strokeWidth={2} aria-hidden="true" className="text-brand-accent" />
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">Generar reporte</h2>
          </div>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
            <Select label="Tipo de reporte" value="Asistencia" />
            <Select label="Actividad" value="Todas" />
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Rango de fechas</span>
              <span className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] font-medium text-ink">
                <span className="flex items-center gap-2 truncate">
                  <CalendarDays size={15} strokeWidth={1.75} aria-hidden="true" className="flex-none text-faint" />
                  Últimos 30 días
                </span>
                <ChevronDown size={15} strokeWidth={2} aria-hidden="true" className="flex-none text-faint" />
              </span>
            </label>
            <button type="button" className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white shadow-sm lg:flex-none">
              <Play size={16} strokeWidth={2.25} aria-hidden="true" /> Generar
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] text-faint">Formato:</span>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-muted">
              <FileText size={15} strokeWidth={1.75} aria-hidden="true" /> PDF
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-muted">
              <FileSpreadsheet size={15} strokeWidth={1.75} aria-hidden="true" /> Excel
            </button>
          </div>
        </section>

        {/* Plantillas */}
        <p className="mb-3 mt-8 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Plantillas de reporte</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {REPORT_TEMPLATES.map((t) => {
            const TplIcon = t.icon;
            return (
              <article key={t.id} className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm">
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
                <button type="button" className="mt-4 inline-flex items-center justify-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-brand">
                  <Play size={15} strokeWidth={2.25} aria-hidden="true" /> Generar
                </button>
              </article>
            );
          })}
        </div>

        {/* Recientes */}
        <p className="mb-3 mt-8 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Reportes recientes</p>
        <RecentReports reports={RECENT_REPORTS} />
      </div>
    </AppShell>
  );
}
