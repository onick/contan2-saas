import type { Metadata } from 'next';
import { Download, Search, ChevronDown } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { ActivityTimeline } from '../../../components/historial/ActivityTimeline';
import { SectionHeader, Button, Card, cn, focusRing } from '../../../components/ui';
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
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Historial"
            subtitle="Registro de actividad y auditoría de la organización"
            actions={
              <Button variant="secondary">
                <Download size={17} strokeWidth={2} aria-hidden="true" /> Exportar
              </Button>
            }
          />
        </div>

        {/* KPIs */}
        <div className="app-stagger mt-6 grid grid-cols-3 gap-4">
          {HISTORY_KPIS.map((k) => (
            <Card key={k.key} padding="md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{k.value}</p>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card padding="none" className="mt-6 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {HISTORY_FILTERS.map((f, i) => (
              <Button key={f} variant="pill" size="sm" selected={i === 0}>
                {f}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" size="sm">
                Últimos 7 días <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
              </Button>
              {/* Búsqueda: input real focusable (uncontrolled hasta el wiring) */}
              <label className="relative hidden sm:block">
                <span className="sr-only">Buscar en el historial</span>
                <Search
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  type="search"
                  placeholder="Buscar en el historial…"
                  className={cn(
                    'h-9 w-60 rounded-full bg-surface-container pl-9 pr-3.5 text-[13px] text-ink placeholder:text-faint',
                    focusRing,
                  )}
                />
              </label>
            </div>
          </div>
        </Card>

        {/* Timeline */}
        <div className="app-reveal mt-4" style={{ animationDelay: '120ms' }}>
          <ActivityTimeline groups={EVENT_GROUPS} />
        </div>
        <p className="mt-3 text-[13px] text-faint tabular-nums">{TOTAL_EVENTS} eventos en los últimos 7 días</p>
      </div>
    </AppShell>
  );
}
