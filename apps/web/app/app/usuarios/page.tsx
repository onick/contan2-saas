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
  title: 'Usuarios',
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

  const byStatus = facets?.byStatus ?? null;
  const pendingCreds = byStatus?.pendiente ?? facets?.counts.noCredential ?? 0;

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
      {children}
    </AppShell>
  );

  if (!view) {
    if (!isDemoFallbackAllowed()) {
      return shell(
        <Unavailable inline title="Usuarios no disponibles" description="No pudimos cargar el padrón de visitantes. Reintenta en unos segundos." />,
      );
    }
    return shell(
      <>
        <DemoBanner />
        <SectionHeader level={1} title="Usuarios" subtitle="Personas con cuenta en la plataforma" actions={actions} />
        <ProfileProvider canEdit={canWrite} layout="column"><div className="mt-4"><UsersTable users={USERS} canWrite={canWrite} /></div></ProfileProvider>
      </>,
    );
  }

  const hasFilters = q.trim() !== '' || cohort !== 'all' || status !== 'active';
  const totalLabel = hasFilters ? 'Resultados' : 'Total';

  // Toolbar
  const toolbar = (
      <Card padding="none" className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 sm:w-72 sm:flex-none">
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
  );

  return shell(
    <>
      <SectionHeader
        level={1}
        title="Usuarios"
        subtitle="Personas con cuenta en la plataforma"
        actions={actions}
      />

      {/* KPIs — partición completa (byStatus, sin filtro de búsqueda) */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCardWithInfo
          icon={Users}
          label="Total"
          value={byStatus === null ? '—' : numero(byStatus.total)}
          tooltipText="Total de visitantes registrados (no archivados)."
        />
        <StatCardWithInfo
          icon={UserCheck}
          label="Activos"
          value={byStatus === null ? '—' : numero(byStatus.activo)}
          tooltipText="Vino o se registró en los últimos 90 días (excluye pendientes)."
        />
        <StatCardWithInfo
          icon={MailX}
          label="Pendientes"
          value={byStatus === null ? '—' : numero(byStatus.pendiente)}
          tooltipText="Visitantes con email registrado pero sin credencial QR enviada aún."
        />
        <StatCardWithInfo
          icon={UserMinus}
          label="Inactivos"
          value={byStatus === null ? '—' : numero(byStatus.inactivo)}
          tooltipText="Sin actividad en más de 90 días (excluye pendientes)."
        />
      </div>

      {/* Lista + columna de detalle (master-detail): la tabla no se tapa en xl */}
      <div className="mt-4">
      {view.total === 0 ? (
        <>
          {toolbar}
          <Card padding="lg" className="mt-4">
            <EmptyState
              icon={SearchX}
              title="Sin resultados"
              description={
                q.trim()
                  ? 'No encontramos usuarios para tu búsqueda. Prueba con otro término.'
                  : cohort !== 'all'
                    ? 'No hay usuarios en esta cohorte.'
                    : 'Aún no hay visitantes registrados.'
              }
            />
          </Card>
          <Pagination total={view.total} page={page} pageSize={pageSize} />
        </>
      ) : (
        <ProfileProvider canEdit={canWrite} layout="column">
          {toolbar}
          <div className="mt-4">
            <UsersTable users={view.users} canWrite={canWrite} />
          </div>
          <Pagination total={view.total} page={page} pageSize={pageSize} />
        </ProfileProvider>
      )}
      </div>
    </>,
  );
}
