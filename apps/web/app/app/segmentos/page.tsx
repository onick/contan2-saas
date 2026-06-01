import type { Metadata } from 'next';
import { Plus, Search, LayoutGrid, List } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { SegmentCard } from '../../../components/segmentos/SegmentCard';
import { getLocalBranding } from '../../../lib/branding/config';
import { SEGMENTS, SEGMENT_KPIS } from '../../../lib/segmentos/demoData';

// RUTA PROVISIONAL del tenant-admin. Segmentos ESTÁTICA con datos demo (solo
// conteos agregados, sin PII). Crear/editar/invitar se cablean con /api/v2.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Segmentos',
  description: 'Segmentos de audiencia del centro cultural',
};

export default function SegmentosPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Segmentos" activeKey="segmentos">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">Segmentos</h1>
            <p className="mt-1 text-muted">Agrupá tu audiencia para invitar y analizar</p>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-[10px] bg-brand-strong px-4 py-2.5 text-sm font-semibold text-white shadow-sm">
            <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nuevo segmento
          </button>
        </header>

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SEGMENT_KPIS.map((k) => (
            <div key={k.key} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Buscar + vista */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex min-w-0 max-w-md flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2.5 text-[13px] text-faint">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">Buscar segmento…</span>
          </div>
          <div className="flex flex-none items-center rounded-lg border border-line bg-surface p-0.5">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-surface-container text-ink" aria-label="Vista cuadrícula">
              <LayoutGrid size={17} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-md text-faint" aria-label="Vista lista">
              <List size={17} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </div>
        </div>

        {/* Grid de segmentos */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SEGMENTS.map((s) => (
            <SegmentCard key={s.id} segment={s} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
