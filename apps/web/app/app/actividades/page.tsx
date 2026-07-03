import type { Metadata } from 'next';
import type { LucideIcon } from 'lucide-react';
import { Suspense } from 'react';
import { CalendarDays, CalendarClock, TrendingUp } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { ActivitiesView } from '../../../components/activities/ActivitiesView';
import { NewActivityButton } from '../../../components/activities/NewActivityButton';
import { SectionHeader, Card, Skeleton } from '../../../components/ui';
import { Unavailable } from '../../../components/shell/Unavailable';
import { DemoBanner } from '../../../components/shell/DemoBanner';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { isDemoFallbackAllowed } from '../../../lib/auth/demo';
import { getActivitiesView } from '../../../lib/api/activities';
import { getAdminGate } from '../../../lib/auth/session';
import { ProfileProvider } from '../../../components/usuarios/ProfileProvider';
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
  // Perfil de visitante EDITABLE desde la lista de asistentes del detalle
  // (mismo editor de Usuarios). owner/admin editan; operator solo lectura.
  const gate = await getAdminGate();
  const canWrite = gate.status === 'ok' && (gate.staff.role === 'owner' || gate.staff.role === 'admin');
  // api caída + demo no permitido (staging/prod) → indisponibilidad, NUNCA demo.
  if (!view && !isDemoFallbackAllowed()) {
    return <Unavailable inline title="Actividades no disponibles" description="No pudimos cargar las actividades. Reintentá en unos segundos." />;
  }
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
      <ProfileProvider canEdit={canWrite}><ActivitiesView activities={activities} total={total} canWrite={canWrite} /></ProfileProvider>
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

export default async function ActividadesPage() {
  const branding = await getTenantBranding();

  return (
    <AppShell branding={branding} title="Actividades" activeKey="actividades">
      <div className="mx-auto w-full max-w-[1600px]">
        {isDemoFallbackAllowed() ? <DemoBanner /> : null}
        <div className="app-reveal">
          <SectionHeader
            level={1}
            title="Actividades"
            subtitle="Gestioná los eventos del centro cultural"
            actions={<NewActivityButton />}
          />
        </div>

        <Suspense fallback={<ActivitiesSkeleton />}>
          <ActivitiesData />
        </Suspense>
      </div>
    </AppShell>
  );
}
