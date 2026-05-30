import type { Metadata } from 'next';
import { Download, ArrowUp, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { AttendanceTable } from '../../../components/registros/AttendanceTable';
import { getLocalBranding } from '../../../lib/branding/config';
import { ATTENDANCE_RECORDS, ATTENDANCE_KPIS, ATTENDANCE_TABS, TOTAL_RECORDS } from '../../../lib/registros/demoData';

// RUTA PROVISIONAL del tenant-admin. Registros de asistencia ESTÁTICA con datos
// demo (no PII). Filtros/exportar son afordancias visuales hasta el wiring.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Registros',
  description: 'Registros de asistencia a las actividades',
};

export default function RegistrosPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Registros" activeKey="registros">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">Registros de asistencia</h1>
            <p className="mt-1 text-muted">Quién asistió a cada actividad</p>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-muted">
            <Download size={17} strokeWidth={2} aria-hidden="true" /> Exportar
          </button>
        </header>

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {ATTENDANCE_KPIS.map((k) => (
            <div key={k.key} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-3xl font-bold tabular-nums text-ink">{k.value}</p>
                {k.trend ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[12px] font-semibold text-success-fg">
                    <ArrowUp size={14} strokeWidth={2.25} aria-hidden="true" /> {k.trend.label}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {ATTENDANCE_TABS.map((t, i) => (
              <button
                key={t}
                type="button"
                aria-pressed={i === 0}
                className={
                  'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ' +
                  (i === 0 ? 'bg-brand text-white' : 'bg-surface-container text-muted hover:text-ink')
                }
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted">
              Actividad: Todas <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted">
              Canal: Todos <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            <div className="ml-auto hidden items-center gap-2 rounded-full bg-surface-container px-3.5 py-2 text-[13px] text-faint sm:flex">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Buscar por visitante o código…</span>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="mt-4">
          <AttendanceTable records={ATTENDANCE_RECORDS} />
        </div>

        {/* Paginación */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
          <div className="inline-flex items-center gap-2">
            <span>Filas por página</span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-medium text-ink">
              10 <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </span>
          </div>
          <div className="inline-flex items-center gap-3">
            <span className="tabular-nums">1–{ATTENDANCE_RECORDS.length} de {TOTAL_RECORDS}</span>
            <span className="inline-flex gap-1">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint" aria-label="Anterior">
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint" aria-label="Siguiente">
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
