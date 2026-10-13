import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Users, UserCheck, MailX, UserMinus } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { UsersTable } from '../../../components/usuarios/UsersTable';
import { NewUserButton } from '../../../components/usuarios/NewUserButton';
import { BulkCredentialsButton } from '../../../components/usuarios/BulkCredentialsButton';
import { ExportButton } from '../../../components/usuarios/ExportButton';
import { ImportButton } from '../../../components/usuarios/ImportButton';
import { CohortFilterButton } from '../../../components/usuarios/CohortFilterButton';
import { EstadoFilterButton } from '../../../components/usuarios/EstadoFilterButton';
import { StatCardWithInfo } from '../../../components/dashboard/StatCardWithInfo';
import { SectionHeader, Card, EmptyState } from '../../../components/ui';
import { Unavailable } from '../../../components/shell/Unavailable';
import { DemoBanner } from '../../../components/shell/DemoBanner';
import { SearchBar } from '../../../components/admin/SearchBar';
import { Pagination } from '../../../components/admin/Pagination';
import { ProfileProvider } from '../../../components/usuarios/ProfileProvider';
import { getTenantBranding } from '../../../lib/branding/tenant';
import { getAdminGate } from '../../../lib/auth/session';
import { isDemoFallbackAllowed } from '../../../lib/auth/demo';
import { getUsersPage, getUsersFacets } from '../../../lib/api/users';
import { numero } from '../../../lib/format';
import { SearchX } from 'lucide-react';
import {
  parsePage, parsePageSize, parseQ, parseCohort, parseUserStatus, qForApi, computeOffset, totalPages,
  patchSearchParams, recordToSearchParams, type Raw,
} from '../../../lib/admin/list-params';
import { USERS } from '../../../lib/usuarios/demoData';

export const metadata: Metadata = {
  title: 'Contan2 v2 · Usuarios',
  description: 'Visitantes registrados del centro cultural',
};

export const dynamic = 'force-dynamic';

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, Raw>>;
}) {
  const sp = await searchParams;
  const branding = await getTenantBranding();
  const gate = await getAdminGate();
  const canWrite = gate.status === 'ok' && (gate.staff.role === 'owner' || gate.staff.role === 'admin');
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const q = parseQ(sp.q);
  const cohort = parseCohort(sp.cohort);
  const status = parseUserStatus(sp.status);

  const [view, facets] = await Promise.all([
    getUsersPage({ limit: pageSize, offset: computeOffset(page, pageSize), q: qForApi(q), cohort, status }),
    getUsersFacets(qForApi(q), status),
  ]);

  if (view) {
    if (view.total === 0 && page !== 1) {
      redirect(`/app/usuarios?${patchSearchParams(recordToSearchParams(sp), { page: undefined })}`);
    } else if (view.total > 0 && computeOffset(page, pageSize) >= view.total) {
      const last = totalPages(view.total, pageSize);
      redirect(`/app/usuarios?${patchSearchParams(recordToSearchParams(sp), { page: String(last) })}`);
    }
  }

  const pendingCreds = facets?.noCredential ?? 0;

  const actions = (
    <>
      {canWrite ? <ImportButton /> : null}
      {canWrite && view ? (
        <ExportButton cohort={cohort} status={status} q={qForApi(q) ?? ''} filteredTotal={view.total} />
      ) : null}
      <NewUserButton />
    </>
  );

  const shell = (children: ReactNode) => (
    <AppShell branding={branding} title="Usuarios" activeKey="usuarios">
      <div className="mx-auto w-full max-w-[1600px]">{children}</div>
    </AppShell>
  );

  if (!view) {
    if (!isDemoFallbackAllowed()) {
      return shell(
        <Unavailable inline title="Usuarios no disponibles" description="No pudimos cargar el padrón de visitantes. Reintentá en unos segundos." />,
      );
    }
    return shell(
      <>
        <DemoBanner />
        <SectionHeader level={1} title="Usuarios" subtitle="Personas con cuenta en la plataforma" actions={actions} />
        <ProfileProvider canEdit={canWrite}><div className="mt-4"><UsersTable users={USERS} canWrite={canWrite} /></div></ProfileProvider>
      </>,
    );
  }

  const hasFilters = q.trim() !== '' || cohort !== 'all' || status !== 'active';
  const totalLabel = hasFilters ? 'Resultados' : 'Total';

  return shell(
    <>
      <SectionHeader
        level={1}
        title="Usuarios"
        subtitle="Personas con cuenta en la plataforma"
        actions={actions}
      />

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCardWithInfo
          icon={Users}
          label={totalLabel}
          value={numero(view.total)}
          tooltipText="Visitantes con cuenta en la plataforma que coinciden con los filtros activos."
        />
        <StatCardWithInfo
          icon={UserCheck}
          label="Activos"
          value={facets === null ? '—' : numero(facets.active)}
          tooltipText="Visitantes que asistieron a una actividad en los últimos 30 días."
        />
        <StatCardWithInfo
          icon={MailX}
          label="Invitaciones pendientes"
          value={facets === null ? '—' : numero(facets.noCredential ?? 0)}
          tooltipText="Visitantes con email registrado pero sin credencial QR enviada."
        />
        <StatCardWithInfo
          icon={UserMinus}
          label="Inactivos"
          value={facets === null ? '—' : numero(facets.dormant)}
          tooltipText="Visitantes sin asistencia registrada en los últimos 90 días, o sin historial."
        />
      </div>

      {/* Toolbar */}
      <Card padding="none" className="mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
            <SearchBar label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo" />
          </div>
          <CohortFilterButton />
          <EstadoFilterButton />
          {canWrite ? (
            <div className="ml-auto">
              <BulkCredentialsButton pendingCount={pendingCreds} className="border-dashed" />
            </div>
          ) : null}
        </div>
      </Card>

      {view.total === 0 ? (
        <Card padding="lg" className="mt-4">
          <EmptyState
            icon={SearchX}
            title="Sin resultados"
            description={
              q.trim()
                ? 'No encontramos usuarios para tu búsqueda. Probá con otro término.'
                : cohort !== 'all'
                  ? 'No hay usuarios en esta cohorte.'
                  : 'Aún no hay visitantes registrados.'
            }
          />
        </Card>
      ) : (
        <ProfileProvider canEdit={canWrite}>
          <div className="mt-4">
            <UsersTable users={view.users} canWrite={canWrite} />
          </div>
        </ProfileProvider>
      )}

      <Pagination total={view.total} page={page} pageSize={pageSize} />
    </>,
  );
}
