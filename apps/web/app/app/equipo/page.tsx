import type { Metadata } from 'next';
import { UserPlus, Search, ChevronDown, ShieldCheck } from 'lucide-react';
import { AppShell } from '../../../components/shell/AppShell';
import { StaffTable } from '../../../components/equipo/StaffTable';
import { RoleCard } from '../../../components/equipo/RoleCard';
import { SectionHeader, Button, Card, cn, focusRing } from '../../../components/ui';
import { getLocalBranding } from '../../../lib/branding/config';
import { STAFF, STAFF_KPIS, ROLES, TOTAL_STAFF } from '../../../lib/equipo/demoData';

// RUTA PROVISIONAL del tenant-admin. Mi equipo ESTÁTICA con datos demo (no PII).
// Invitar / cambiar rol / revocar son afordancias visuales hasta el wiring de
// /api/v2/org/staff + RBAC.
export const metadata: Metadata = {
  title: 'Contan2 v2 · Mi equipo',
  description: 'Miembros, roles y permisos de la organización',
};

export default function EquipoPage() {
  const branding = getLocalBranding();

  return (
    <AppShell branding={branding} title="Mi equipo" activeKey="equipo">
      <div className="mx-auto w-full max-w-[1600px]">
        {/* Encabezado + acciones */}
        <SectionHeader
          level={1}
          title="Mi equipo"
          subtitle="Quién tiene acceso a la organización y con qué permisos"
          actions={
            <>
              <Button variant="secondary">
                <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" /> Gestionar roles
              </Button>
              <Button>
                <UserPlus size={18} strokeWidth={2} aria-hidden="true" /> Invitar miembro
              </Button>
            </>
          }
        />

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          {STAFF_KPIS.map((k) => (
            <Card key={k.key} padding="md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{k.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{k.value}</p>
            </Card>
          ))}
        </div>

        {/* Miembros */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">Miembros</h2>
          {/* Búsqueda: input real focusable (uncontrolled hasta el wiring) */}
          <label className="relative hidden sm:block">
            <span className="sr-only">Buscar por nombre o email</span>
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              type="search"
              placeholder="Buscar por nombre o email…"
              className={cn(
                'h-9 w-64 rounded-full bg-surface-container pl-9 pr-3.5 text-[13px] text-ink placeholder:text-faint',
                focusRing,
              )}
            />
          </label>
        </div>
        <div className="mt-3">
          <StaffTable members={STAFF} />
        </div>
        <p className="mt-3 text-[13px] text-faint tabular-nums">{TOTAL_STAFF} miembros en total</p>

        {/* Roles y permisos */}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">Roles y permisos</h2>
            <p className="mt-1 text-[13px] text-muted">Cada miembro tiene un rol con permisos predefinidos</p>
          </div>
          <a
            href="#"
            className={cn('inline-flex items-center gap-1 rounded px-1 text-[13px] font-semibold text-brand', focusRing)}
          >
            Personalizar permisos <ChevronDown size={15} strokeWidth={2} aria-hidden="true" className="-rotate-90" />
          </a>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ROLES.map((r) => (
            <RoleCard key={r.key} role={r} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
