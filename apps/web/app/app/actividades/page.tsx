import type { Metadata } from 'next';
import type { LucideIcon } from 'lucide-react';
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
import { getActivitiesView } from '../../../lib/api/activities';
import type { Activity } from '../../../lib/activities/demoData';
import { ACTIVITIES, STATUS_TABS, ACTIVITIES_KPIS } from '../../../lib/activities/demoData';

// RUTA PROVISIONAL del tenant-admin. KPIs + pills + tabla se derivan de UN solo
// fetch a GET /api/v2/activities (read-only): todo-real o todo-demo (fallback)
// → nunca KPI real con tabla demo. Total real; conteos por estado y ocupación
// promedio son sobre el set cargado (limit 100). /app/actividades es Dynamic.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Actividades',
  description: 'Gestión de actividades del centro cultural',
};

interface Kpi { key: string; label: string; value: string; icon: LucideIcon }
interface Tab { key: string; label: string; count: number }

// Sección de datos · async. Deriva KPIs/pills/tabla del view real, o todo demo.
async function ActivitiesData() {
  const view = await getActivitiesView();
  const activities: Activity[] = view?.activities ?? ACTIVITIES;
  const total = view?.total ?? activities.length;

  const kpis: Kpi[] = view
    ? [
        { key: 'total', label: 'Total', value: String(view.total), icon: CalendarDays },
        { key: 'activas', label: 'Activas', value: String(view.activas), icon: CalendarClock },
        { key: 'ocupacion', label: 'Ocupación promedio', value: `${view.avgOccupancyPct}%`, icon: TrendingUp },
      ]
    : [
        { key: 'total', label: 'Total', value: String(ACTIVITIES_KPIS.total), icon: CalendarDays },
        { key: 'proximas', label: 'Próximas', value: String(ACTIVITIES_KPIS.proximas), icon: CalendarClock },
        { key: 'ocupacion', label: 'Ocupación promedio', value: ACTIVITIES_KPIS.ocupacionPromedio, icon: TrendingUp },
      ];

  // Pills: estados reales de la API (Todas/Activas/Finalizadas/Canceladas) o,
  // en fallback, los tabs demo (Todas/Próximas/En curso/Finalizadas/Borradores).
  const tabs: Tab[] = view
    ? [
        { key: 'todas', label: 'Todas', count: view.total },
        { key: 'activas', label: 'Activas', count: view.activas },
        { key: 'finalizadas', label: 'Finalizadas', count: view.finalizadas },
        { key: 'canceladas', label: 'Canceladas', count: view.canceladas },
      ]
    : STATUS_TABS.map((t) => ({ key: t.key, label: t.label, count: t.count }));

  return (
    <>
      {/* Mini-KPIs */}
      <div className="app-stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((k) => {
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
      <Card padding="none" className="app-reveal mt-6 p-4" style={{ animationDelay: '120ms' }}>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t, i) => (
            <Button key={t.key} variant="pill" size="sm" selected={i === 0}>
              {t.label} <span className="tabular-nums opacity-70">({t.count})</span>
            </Button>
          ))}
        </div>
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

      {/* Tabla */}
      <div className="mt-4">
        <ActivitiesTable activities={activities} />
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
          <span className="tabular-nums">1–{activities.length} de {total}</span>
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

// Skeleton de KPIs + filtros + tabla mientras resuelve el fetch.
function ActivitiesSkeleton() {
  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} padding="md" className="flex items-center gap-4">
            <Skeleton className="h-11 w-11 flex-none rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-1.5 h-6 w-12" />
            </div>
          </Card>
        ))}
      </div>
      <Card padding="none" className="mt-6 p-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </Card>
      <Card padding="none" className="mt-4 overflow-hidden">
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
    </>
  );
}

export default function ActividadesPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Actividades" activeKey="actividades">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="app-reveal">
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
        </div>

        <Suspense fallback={<ActivitiesSkeleton />}>
          <ActivitiesData />
        </Suspense>
      </div>
    </AppShell>
  );
}
