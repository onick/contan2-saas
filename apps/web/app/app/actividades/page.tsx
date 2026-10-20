import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '../../../components/shell/AppShell';
import { ActivitiesKpis } from '../../../components/activities/ActivitiesKpis';
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
  title: 'Actividades',
  description: 'Gestión de actividades del centro cultural',
};

// Sección de datos · async. KPIs server + pasa el set a la vista interactiva.
async function ActivitiesData() {
  const view = await getActivitiesView();
  // Perfil de visitante EDITABLE desde la lista de asistentes del detalle
  // (mismo editor de Usuarios). owner/admin editan; operator solo lectura.
  const gate = await getAdminGate();
  const canWrite = gate.status === 'ok' && (gate.staff.role === 'owner' || gate.staff.role === 'admin');
  // api caída + demo no permitido (staging/prod) → indisponibilidad, NUNCA demo.
  if (!view && !isDemoFallbackAllowed()) {
    return <Unavailable inline title="Actividades no disponibles" description="No pudimos cargar las actividades. Reintenta en unos segundos." />;
  }
  const activities: Activity[] = view?.activities ?? ACTIVITIES;
  const total = view?.total ?? activities.length;

  // Conteos por estado: reales desde la vista; en demo se derivan del set demo.
  const counts = view
    ? { total: view.total, activas: view.activas, finalizadas: view.finalizadas, canceladas: view.canceladas, avg: view.avgOccupancyPct }
    : {
        total: activities.length,
        activas: activities.filter((x) => x.status === 'soon' || x.status === 'live').length,
        finalizadas: activities.filter((x) => x.status === 'done').length,
        canceladas: activities.filter((x) => x.status === 'draft').length,
        avg: parseInt(ACTIVITIES_KPIS.ocupacionPromedio, 10) || 0,
      };

  return (
    <>
      <ActivitiesKpis
        total={counts.total}
        activas={counts.activas}
        finalizadas={counts.finalizadas}
        canceladas={counts.canceladas}
        avgOccupancyPct={counts.avg}
      />

      {/* Filtros + vista (lista/grid) + detalle · interactivo, en memoria */}
      <ProfileProvider canEdit={canWrite}><ActivitiesView activities={activities} total={total} canWrite={canWrite} /></ProfileProvider>
    </>
  );
}

// Skeleton de KPIs + filtros + tabla mientras resuelve el fetch.
function ActivitiesSkeleton() {
  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1.5fr_1fr_1fr]">
        <Skeleton className="min-h-[188px] rounded-card md:min-h-[200px]" />
        <Skeleton className="min-h-[188px] rounded-card md:min-h-[200px]" />
        <Skeleton className="min-h-[148px] rounded-card md:min-h-[200px]" />
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
      {isDemoFallbackAllowed() ? <DemoBanner /> : null}
      <div className="app-reveal">
        <SectionHeader
          level={1}
          title="Actividades"
          subtitle="Gestiona los eventos del centro cultural"
          actions={<NewActivityButton />}
        />
      </div>

      <Suspense fallback={<ActivitiesSkeleton />}>
        <ActivitiesData />
      </Suspense>
    </AppShell>
  );
}
