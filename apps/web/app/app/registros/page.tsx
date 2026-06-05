import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Download, ArrowUp, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { AttendanceTable } from '../../../components/registros/AttendanceTable';
import { SectionHeader, Button, IconButton, Card, Skeleton, cn, focusRing } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { isDemoFallbackAllowed } from '../../../lib/auth/demo';
import { Unavailable } from '../../../components/shell/Unavailable';
import { DemoBanner } from '../../../components/shell/DemoBanner';
import { getAttendanceView } from '../../../lib/api/attendance';
import type { AttendanceKpi, AttendanceRecord } from '../../../lib/registros/demoData';
import { ATTENDANCE_RECORDS, ATTENDANCE_KPIS, ATTENDANCE_TABS, TOTAL_RECORDS } from '../../../lib/registros/demoData';

// RUTA PROVISIONAL del tenant-admin. KPIs + tabla + paginación se derivan de un
// fetch combinado (/attendance + /dashboard/metrics, read-only): todo-real o
// todo-demo (fallback) → nunca KPI real con tabla demo. Total y tasa reales;
// "Asistencias hoy" es sobre el set cargado (≤100). Pills de fecha = visuales.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Registros',
  description: 'Registros de asistencia a las actividades',
};

async function AttendanceData() {
  const view = await getAttendanceView();
  // api caída + demo no permitido (staging/prod) → indisponibilidad, NUNCA demo.
  if (!view && !isDemoFallbackAllowed()) {
    return <Unavailable inline title="Registros no disponibles" description="No pudimos cargar las asistencias. Reintentá en unos segundos." />;
  }
  const records: AttendanceRecord[] = view?.records ?? ATTENDANCE_RECORDS;
  const total = view ? view.total.toLocaleString('en-US') : TOTAL_RECORDS;

  const kpis: AttendanceKpi[] = view
    ? [
        { key: 'hoy', label: 'Asistencias hoy', value: String(view.hoy) },
        { key: 'total', label: 'Total (30 días)', value: view.total.toLocaleString('en-US') },
        { key: 'tasa', label: 'Tasa de asistencia', value: `${view.tasaPct}%` },
        { key: 'noshow', label: 'No-show', value: `${view.noShowPct}%` },
      ]
    : ATTENDANCE_KPIS;

  return (
    <>
      {/* KPIs */}
      <div className="app-stagger mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
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

      {/* Filtros · pills de fecha = visuales (la API no filtra por fecha aún) */}
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
        <AttendanceTable records={records} />
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
          <span className="tabular-nums">1–{records.length} de {total}</span>
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
    </>
  );
}

function AttendanceSkeleton() {
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} padding="md">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-8 w-16" />
          </Card>
        ))}
      </div>
      <Card padding="none" className="mt-6 p-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-full" />
          ))}
        </div>
      </Card>
      <Card padding="none" className="mt-4 overflow-hidden">
        <div className="px-5 py-4 md:px-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-line py-4 first:border-t-0">
              <Skeleton className="h-10 w-10 flex-none rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </div>
              <Skeleton className="ml-auto hidden h-6 w-24 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

export default function RegistrosPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Registros" activeKey="registros">
      <div className="mx-auto w-full max-w-[1600px]">
        {isDemoFallbackAllowed() ? <DemoBanner /> : null}
        <div className="app-reveal">
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
        </div>

        <Suspense fallback={<AttendanceSkeleton />}>
          <AttendanceData />
        </Suspense>
      </div>
    </AppShell>
  );
}
