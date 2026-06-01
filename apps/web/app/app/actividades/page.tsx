import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  Plus,
  CalendarDays,
  CalendarClock,
  TrendingUp,
  ChevronDown,
  Search,
  List,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { ActivitiesTable } from '../../../components/activities/ActivitiesTable';
import { SectionHeader, Button, IconButton, Card, Skeleton, cn, focusRing } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { getActivities } from '../../../lib/api/activities';
import { ACTIVITIES, STATUS_TABS, ACTIVITIES_KPIS } from '../../../lib/activities/demoData';

// Tabla con datos reales (read-only) si hay sesión; si no, demoData. Async →
// streamea en <Suspense>. Los KPIs/filtros siguen demo en esta fase (mapeo de
// datos base primero, como se acordó).
async function ActivitiesTableData() {
  const activities = (await getActivities()) ?? ACTIVITIES;
  return <ActivitiesTable activities={activities} />;
}

// Skeleton de la tabla mientras resuelve el fetch.
function ActivitiesTableSkeleton() {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-4 md:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-line py-4 first:border-t-0">
            <Skeleton className="h-10 w-10 flex-none rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-1.5 h-3 w-20" />
            </div>
            <Skeleton className="ml-auto hidden h-8 w-40 sm:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// RUTA PROVISIONAL del tenant-admin. Pantalla de Actividades ESTÁTICA con datos
// locales. Filtros, búsqueda, vista y paginación son afordancias visuales (se
// cablean con el wiring de /api/v2).
export const metadata: Metadata = {
  title: 'Contan2 v2 · Actividades',
  description: 'Gestión de actividades del centro cultural',
};

const KPIS = [
  { key: 'total', label: 'Total', value: String(ACTIVITIES_KPIS.total), icon: CalendarDays },
  { key: 'proximas', label: 'Próximas', value: String(ACTIVITIES_KPIS.proximas), icon: CalendarClock },
  { key: 'ocupacion', label: 'Ocupación promedio', value: ACTIVITIES_KPIS.ocupacionPromedio, icon: TrendingUp },
];

export default function ActividadesPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Actividades" activeKey="actividades">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado + acción */}
        <SectionHeader
          level={1}
          title="Actividades"
          subtitle="Gestioná los eventos del centro cultural"
          actions={
            <Button>
              <Plus size={18} strokeWidth={2.25} aria-hidden="true" /> Nueva actividad
            </Button>
          }
        />

        {/* Mini-KPIs */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {KPIS.map((k) => {
            const KIcon = k.icon;
            return (
              <Card key={k.key} padding="md" className="flex items-center gap-4">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-primary-container text-on-primary-container">
                  <KIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
                  <p className="text-2xl font-bold tabular-nums text-ink">{k.value}</p>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Barra de filtros */}
        <Card padding="none" className="mt-6 p-4">
          {/* Tabs de estado (pills toggle) */}
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((t) => (
              <Button key={t.key} variant="pill" size="sm" selected={t.key === 'todas'}>
                {t.label} <span className="tabular-nums opacity-70">({t.count})</span>
              </Button>
            ))}
          </div>

          {/* Filtros secundarios */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button variant="secondary" size="sm">
              Categoría: Todas <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="sm">
              <CalendarDays size={15} strokeWidth={1.75} aria-hidden="true" /> Fecha{' '}
              <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full bg-surface-container px-3.5 py-2 text-[13px] text-faint sm:flex">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Buscar actividad…</span>
              </div>
              {/* Toggle de vista (segmentado · botones reales con foco) */}
              <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
                <button
                  type="button"
                  aria-label="Vista lista"
                  aria-pressed={true}
                  className={cn('grid h-8 w-8 place-items-center rounded-md bg-surface-container text-ink', focusRing)}
                >
                  <List size={17} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Vista cuadrícula"
                  aria-pressed={false}
                  className={cn('grid h-8 w-8 place-items-center rounded-md text-faint hover:text-muted', focusRing)}
                >
                  <LayoutGrid size={17} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabla (datos reales read-only con skeleton + fallback a demo) */}
        <div className="mt-4">
          <Suspense fallback={<ActivitiesTableSkeleton />}>
            <ActivitiesTableData />
          </Suspense>
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
            <span className="tabular-nums">1–{ACTIVITIES.length} de {ACTIVITIES.length}</span>
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
