import type { Metadata } from 'next';
import { Download, ArrowUp, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { AttendanceTable } from '../../../components/registros/AttendanceTable';
import { SectionHeader, Button, IconButton, Card, cn, focusRing } from '../../../components/ui';
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
        <SectionHeader
          level={1}
          title="Registros de asistencia"
          subtitle="Quién asistió a cada actividad"
          actions={
            <Button variant="secondary">
              <Download size={17} strokeWidth={2} aria-hidden="true" /> Exportar
            </Button>
          }
        />

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {ATTENDANCE_KPIS.map((k) => (
            <Card key={k.key} padding="md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-3xl font-bold tabular-nums text-ink">{k.value}</p>
                {k.trend ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[12px] font-semibold text-success-fg">
                    <ArrowUp size={14} strokeWidth={2.25} aria-hidden="true" /> {k.trend.label}
                  </span>
                ) : null}
              </div>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card padding="none" className="mt-6 p-4">
          <div className="flex flex-wrap gap-2">
            {ATTENDANCE_TABS.map((t, i) => (
              <Button key={t} variant="pill" size="sm" selected={i === 0}>
                {t}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button variant="secondary" size="sm">
              Actividad: Todas <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="sm">
              Canal: Todos <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </Button>
            {/* Búsqueda: input real focusable (uncontrolled hasta el wiring) */}
            <label className="relative ml-auto hidden sm:block">
              <span className="sr-only">Buscar por visitante o código</span>
              <Search
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="search"
                placeholder="Buscar por visitante o código…"
                className={cn(
                  'h-9 w-72 rounded-full bg-surface-container pl-9 pr-3.5 text-[13px] text-ink placeholder:text-faint',
                  focusRing,
                )}
              />
            </label>
          </div>
        </Card>

        {/* Tabla */}
        <div className="mt-4">
          <AttendanceTable records={ATTENDANCE_RECORDS} />
        </div>

        {/* Paginación */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
          <div className="inline-flex items-center gap-2">
            <span>Filas por página</span>
            <Button variant="secondary" size="sm">
              10 <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>
          <div className="inline-flex items-center gap-3">
            <span className="tabular-nums">1–{ATTENDANCE_RECORDS.length} de {TOTAL_RECORDS}</span>
            <span className="inline-flex gap-1">
              <IconButton label="Anterior" variant="outline" size="sm">
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              </IconButton>
              <IconButton label="Siguiente" variant="outline" size="sm">
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
