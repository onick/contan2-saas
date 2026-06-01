import { MoreHorizontal, UsersRound } from 'lucide-react';
import type { StaffMember, StaffStatus, RoleKey } from '../../lib/equipo/demoData';
import { Card, Chip, IconButton, EmptyState, cn, focusRing, type ChipTone } from '../ui';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Avatar tonal por índice → da vida sin romper coherencia (mismo set que Usuarios).
const AVATAR_COLORS = [
  'bg-[#ffe6d2] text-[#7a3300]',
  'bg-[#e3f4f1] text-[#0f7a6b]',
  'bg-[#efe9fb] text-[#6b3fb8]',
  'bg-[#e8f0fe] text-[#1a56b0]',
  'bg-[#fdeaf0] text-[#b03060]',
];

// Chip de rol con color propio por rol (5 tonos distintos, fuera de la paleta
// de Chip) → se mantiene inline, análogo a CategoryChip.
const ROLE_STYLE: Record<RoleKey, string> = {
  propietario: 'bg-accent-soft text-[#b35400]',
  administrador: 'bg-[#e8f0fe] text-[#1a56b0]',
  coordinador: 'bg-[#efe9fb] text-[#6b3fb8]',
  recepcion: 'bg-[#e3f4f1] text-[#0f7a6b]',
  lectura: 'bg-surface-container text-muted',
};

// Estado → tono de Chip (activo=verde, pendiente=naranja, inactivo=neutral).
const STATUS_TONE: Record<StaffStatus, ChipTone> = {
  activo: 'success',
  pendiente: 'warning',
  inactivo: 'neutral',
};

export interface StaffTableProps {
  members: StaffMember[];
}

// Tabla del equipo · avatar con iniciales + email, chip de rol, estado con punto
// y último acceso. En mobile se oculta el último acceso. Server Component, datos
// demo (no PII real).
export function StaffTable({ members }: StaffTableProps) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Sin miembros"
        description="Invitá a tu equipo para que pueda gestionar la organización."
      />
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
              <th className="px-5 py-3 md:px-6">Miembro</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="hidden px-4 py-3 md:table-cell">Último acceso</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const avatar = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <tr key={m.id} className="border-t border-line align-middle hover:bg-page">
                  <td className="px-5 py-4 md:px-6">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-[12px] font-semibold ${avatar}`}>
                        {initials(m.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tracking-tight text-ink">{m.name}</p>
                        <p className="truncate text-xs text-faint">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${ROLE_STYLE[m.role]}`}>
                      {m.roleLabel}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <Chip tone={STATUS_TONE[m.status]} dot>{m.statusLabel}</Chip>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] text-muted md:table-cell">{m.lastActive}</td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <a href="#" className={cn('rounded px-1 text-[13px] font-semibold text-brand', focusRing)}>Gestionar</a>
                      <IconButton label="Más acciones" variant="ghost" size="sm">
                        <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
