import type { Metadata } from 'next';
import type { LucideIcon } from 'lucide-react';
import { Suspense } from 'react';
import { Plus, CalendarDays, CalendarClock, TrendingUp } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { ActivitiesView } from '../../../components/activities/ActivitiesView';
import { SectionHeader, Button, Card, Skeleton } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { getActivitiesView } from '../../../lib/api/activities';
import type { Activity } from '../../../lib/activities/demoData';
import { ACTIVITIES, ACTIVITIES_KPIS } from '../../../lib/activities/demoData';

// RUTA PROVISIONAL del tenant-admin. KPIs (server) + un solo fetch a
// GET /api/v2/activities (read-only): todo-real o todo-demo (fallback). La capa
// interactiva (filtros/vista/detalle) vive en ActivitiesView (client), que filtra
// EN MEMORIA el set cargado — cero escrituras. /app/actividades es Dynamic.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Actividades',
  description: 'Gestión de actividades del centro cultural',
};

interface Kpi { key: string; label: string; value: string; icon: LucideIcon }

// Sección de datos · async. KPIs server + pasa el set a la vista interactiva.
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

  return (
    <>
      {/* Mini-KPIs (server, agregados) */}
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

      {/* Filtros + vista (lista/grid) + detalle · interactivo, en memoria */}
      <ActivitiesView activities={activities} total={total} />
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
