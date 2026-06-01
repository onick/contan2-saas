import type { Metadata } from 'next';
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
import { getLocalBranding } from '../../../lib/branding/config';
import { USERS, USER_KPIS, USER_TABS, TOTAL_USERS } from '../../../lib/usuarios/demoData';

// RUTA PROVISIONAL del tenant-admin. Usuarios ESTÁTICA con datos demo (no PII).
// Filtros/búsqueda/exportar son afordancias visuales hasta el wiring de /api/v2.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Usuarios',
  description: 'Visitantes registrados del centro cultural',
};

export default function UsuariosPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Usuarios" activeKey="usuarios">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado + acciones */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-ink xl:text-[30px]">Usuarios</h1>
            <p className="mt-1 text-muted">Visitantes registrados del centro</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-muted">
              <Download size={17} strokeWidth={2} aria-hidden="true" /> Exportar
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-[10px] bg-brand-strong px-4 py-2.5 text-sm font-semibold text-white shadow-sm">
              <UserPlus size={18} strokeWidth={2} aria-hidden="true" /> Nuevo usuario
            </button>
          </div>
        </header>

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {USER_KPIS.map((k) => (
            <div key={k.key} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-3xl font-bold tabular-nums text-ink">{k.value}</p>
                {k.trend ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[12px] font-semibold text-success-fg">
                    <ArrowUp size={14} strokeWidth={2.25} aria-hidden="true" /> {k.trend.label}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {USER_TABS.map((t, i) => (
              <button
                key={t}
                type="button"
                aria-pressed={i === 0}
                className={
                  'rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ' +
                  (i === 0 ? 'bg-brand-strong text-white' : 'bg-surface-container text-muted hover:text-ink')
                }
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted">
              Segmento: Todos <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted">
              Orden: Recientes <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full bg-surface-container px-3.5 py-2 text-[13px] text-faint sm:flex">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Buscar por nombre, email o código…</span>
              </div>
              <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-surface-container text-ink" aria-label="Vista tabla">
                  <List size={17} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-md text-faint" aria-label="Vista tarjetas">
                  <LayoutGrid size={17} strokeWidth={1.75} aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="mt-4">
          <UsersTable users={USERS} />
        </div>

        {/* Paginación */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
          <div className="inline-flex items-center gap-2">
            <span>Filas por página</span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-medium text-ink">
              10 <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </span>
          </div>
          <div className="inline-flex items-center gap-3">
            <span className="tabular-nums">1–{USERS.length} de {TOTAL_USERS}</span>
            <span className="inline-flex gap-1">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint" aria-label="Anterior">
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-line text-faint" aria-label="Siguiente">
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
