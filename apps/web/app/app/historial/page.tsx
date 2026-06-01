import type { Metadata } from 'next';
import { Download, Search, ChevronDown } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { ActivityTimeline } from '../../../components/historial/ActivityTimeline';
import { getLocalBranding } from '../../../lib/branding/config';
import { EVENT_GROUPS, HISTORY_KPIS, HISTORY_FILTERS, TOTAL_EVENTS } from '../../../lib/historial/demoData';

// RUTA PROVISIONAL del tenant-admin. Historial ESTÁTICA con datos demo (no PII).
// Filtros/búsqueda/exportar son afordancias visuales hasta el wiring de
// /api/v2/org/audit.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Historial',
  description: 'Registro de actividad y auditoría de la organización',
};

export default function HistorialPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Historial" activeKey="historial">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado + acciones */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">Historial</h1>
            <p className="mt-1 text-muted">Registro de actividad y auditoría de la organización</p>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-muted">
            <Download size={17} strokeWidth={2} aria-hidden="true" /> Exportar
          </button>
        </header>

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          {HISTORY_KPIS.map((k) => (
            <div key={k.key} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {HISTORY_FILTERS.map((f, i) => (
              <button
                key={f}
                type="button"
                aria-pressed={i === 0}
                className={
                  'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ' +
                  (i === 0 ? 'bg-brand-strong text-white' : 'bg-surface-container text-muted hover:text-ink')
                }
              >
                {f}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted">
                Últimos 7 días <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
              </button>
              <div className="hidden items-center gap-2 rounded-full bg-surface-container px-3.5 py-2 text-[13px] text-faint sm:flex">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Buscar en el historial…</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-4">
          <ActivityTimeline groups={EVENT_GROUPS} />
        </div>
        <p className="mt-3 text-[13px] text-faint tabular-nums">{TOTAL_EVENTS} eventos en los últimos 7 días</p>
      </div>
    </AppShell>
  );
}
