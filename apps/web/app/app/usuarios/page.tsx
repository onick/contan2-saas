import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  Download,
  UserPlus,
  ArrowUp,
  ChevronDown,
  Search,
  List,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { UsersTable } from '../../../components/usuarios/UsersTable';
import { SectionHeader, Button, IconButton, Card, Skeleton, cn, focusRing } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { getUsers } from '../../../lib/api/users';
import { USERS, USER_KPIS, USER_TABS, TOTAL_USERS } from '../../../lib/usuarios/demoData';

// RUTA PROVISIONAL del tenant-admin. La TABLA se cablea read-only a
// GET /api/v2/users (PII real al staff autenticado del mismo tenant); si no hay
// datos reales (sin sesión / api-v2 caído) cae a demoData. KPIs/filtros/búsqueda
// siguen demo en esta fase.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Usuarios',
  description: 'Visitantes registrados del centro cultural',
};

// Tabla async (toca cookies()/fetch → dinámica). Streamea en <Suspense>.
async function UsersTableData() {
  const users = (await getUsers()) ?? USERS;
  return <UsersTable users={users} />;
}

function UsersTableSkeleton() {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-4 md:px-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-line py-4 first:border-t-0">
            <Skeleton className="h-10 w-10 flex-none rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-1.5 h-3 w-28" />
            </div>
            <Skeleton className="ml-auto hidden h-6 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function UsuariosPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Usuarios" activeKey="usuarios">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado + acciones */}
        <SectionHeader
          level={1}
          title="Usuarios"
          subtitle="Visitantes registrados del centro"
          actions={
            <>
              <Button variant="secondary">
                <Download size={17} strokeWidth={2} aria-hidden="true" /> Exportar
              </Button>
              <Button>
                <UserPlus size={18} strokeWidth={2} aria-hidden="true" /> Nuevo usuario
              </Button>
            </>
          }
        />

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {USER_KPIS.map((k) => (
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
            {USER_TABS.map((t, i) => (
              <Button key={t} variant="pill" size="sm" selected={i === 0}>
                {t}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button variant="secondary" size="sm">
              Segmento: Todos <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="sm">
              Orden: Recientes <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {/* Búsqueda: input real focusable (uncontrolled hasta el wiring) */}
              <label className="relative hidden sm:block">
                <span className="sr-only">Buscar por nombre, email o código</span>
                <Search
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  type="search"
                  placeholder="Buscar por nombre, email o código…"
                  className={cn(
                    'h-9 w-72 rounded-full bg-surface-container pl-9 pr-3.5 text-[13px] text-ink placeholder:text-faint',
                    focusRing,
                  )}
                />
              </label>
              {/* Toggle de vista (segmentado · botones reales con foco) */}
              <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
                <button
                  type="button"
                  aria-label="Vista tabla"
                  aria-pressed={true}
                  className={cn('grid h-8 w-8 place-items-center rounded-md bg-surface-container text-ink', focusRing)}
                >
                  <List size={17} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Vista tarjetas"
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
          <Suspense fallback={<UsersTableSkeleton />}>
            <UsersTableData />
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
            <span className="tabular-nums">1–{USERS.length} de {TOTAL_USERS}</span>
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
