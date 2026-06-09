import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Download, UserPlus, SearchX } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { UsersTable } from '../../../components/usuarios/UsersTable';
import { SectionHeader, Button, Card, EmptyState } from '../../../components/ui';
import { Unavailable } from '../../../components/shell/Unavailable';
import { DemoBanner } from '../../../components/shell/DemoBanner';
import { SearchBar } from '../../../components/admin/SearchBar';
import { Pagination } from '../../../components/admin/Pagination';
import { CohortPills } from '../../../components/usuarios/CohortPills';
import { getLocalBranding } from '../../../lib/branding/config';
import { isDemoFallbackAllowed } from '../../../lib/auth/demo';
import { getUsersPage, getUsersFacets } from '../../../lib/api/users';
import {
  parsePage, parsePageSize, parseQ, parseCohort, qForApi, computeOffset, totalPages,
  patchSearchParams, recordToSearchParams, type Raw,
} from '../../../lib/admin/list-params';
import { USERS } from '../../../lib/usuarios/demoData';

// Usuarios · paginación + búsqueda SERVER-SIDE (la URL es la fuente de verdad).
// La tabla es presentacional (sin filtrado cliente). KPI de cabecera = total real
// (API). API caída → Unavailable; nunca demo salvo dev con ALLOW_DEMO_FALLBACK.
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
  const branding = getLocalBranding();
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const q = parseQ(sp.q);
  const cohort = parseCohort(sp.cohort);

  // Listado (filtrado por cohorte + búsqueda) + conteos por cohorte (facets, solo
  // dentro de la búsqueda vigente) en paralelo. Los facets son best-effort.
  const [view, facets] = await Promise.all([
    getUsersPage({ limit: pageSize, offset: computeOffset(page, pageSize), q: qForApi(q), cohort }),
    getUsersFacets(qForApi(q)),
  ]);

  // Página fuera de rango (URL vieja / datos borrados): normaliza preservando
  // filtros. total=0 → página 1; offset ≥ total>0 → última página válida.
  if (view) {
    if (view.total === 0 && page !== 1) {
      redirect(`/app/usuarios?${patchSearchParams(recordToSearchParams(sp), { page: undefined })}`);
    } else if (view.total > 0 && computeOffset(page, pageSize) >= view.total) {
      const last = totalPages(view.total, pageSize);
      redirect(`/app/usuarios?${patchSearchParams(recordToSearchParams(sp), { page: String(last) })}`);
    }
  }

  const actions = (
    <>
      <Button variant="secondary"><Download size={17} strokeWidth={2} aria-hidden="true" /> Exportar</Button>
      <Button><UserPlus size={18} strokeWidth={2} aria-hidden="true" /> Nuevo usuario</Button>
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
        <SectionHeader level={1} title="Usuarios" subtitle="Visitantes registrados del centro" actions={actions} />
        <div className="mt-4"><UsersTable users={USERS} /></div>
      </>,
    );
  }

  return shell(
    <>
      <SectionHeader
        level={1}
        title="Usuarios"
        subtitle={`${view.total.toLocaleString('en-US')} visitantes registrados`}
        actions={actions}
      />
      <Card padding="none" className="mt-6 space-y-3 p-4">
        <CohortPills counts={facets} />
        <div className="flex items-center gap-2">
          <div className="ml-auto min-w-0 flex-1 sm:flex-none">
            <SearchBar label="Buscar por nombre, email, código o teléfono" placeholder="Buscar por nombre, email, código o teléfono…" />
          </div>
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
        <div className="mt-4"><UsersTable users={view.users} /></div>
      )}

      <Pagination total={view.total} page={page} pageSize={pageSize} />
    </>,
  );
}
