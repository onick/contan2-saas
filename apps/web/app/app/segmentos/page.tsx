import type { Metadata } from 'next';
import { Plus, Search, LayoutGrid, List, Layers } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { SegmentCard } from '../../../components/segmentos/SegmentCard';
import { SectionHeader, Button, Card, EmptyState, cn, focusRing } from '../../../components/ui';
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
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Segmentos"
            subtitle="Agrupá tu audiencia para invitar y analizar"
            actions={
              <Button>
                <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nuevo segmento
              </Button>
            }
          />
        </div>

        {/* KPIs */}
        <div className="app-stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SEGMENT_KPIS.map((k) => (
            <Card key={k.key} padding="md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{k.value}</p>
            </Card>
          ))}
        </div>

        {/* Buscar + vista */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {/* Búsqueda: input real focusable (uncontrolled hasta el wiring) */}
          <label className="relative min-w-0 max-w-md flex-1">
            <span className="sr-only">Buscar segmento</span>
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              type="search"
              placeholder="Buscar segmento…"
              className={cn(
                'h-10 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-[13px] text-ink placeholder:text-faint',
                focusRing,
              )}
            />
          </label>
          {/* Toggle de vista (segmentado · botones reales con foco) */}
          <div className="flex flex-none items-center rounded-lg border border-line bg-surface p-0.5">
            <button
              type="button"
              aria-label="Vista cuadrícula"
              aria-pressed={true}
              className={cn('grid h-8 w-8 place-items-center rounded-md bg-surface-container text-ink', focusRing)}
            >
              <LayoutGrid size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Vista lista"
              aria-pressed={false}
              className={cn('grid h-8 w-8 place-items-center rounded-md text-faint hover:text-muted', focusRing)}
            >
              <List size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Grid de segmentos */}
        {SEGMENTS.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Layers}
            title="Sin segmentos"
            description="Creá tu primer segmento para agrupar visitantes e invitarlos."
            action={
              <Button>
                <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nuevo segmento
              </Button>
            }
          />
        ) : (
          <div className="app-stagger mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SEGMENTS.map((s) => (
              <SegmentCard key={s.id} segment={s} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
