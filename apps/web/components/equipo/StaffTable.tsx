import { MoreHorizontal } from 'lucide-react';
import type { StaffMember, StaffStatus, RoleKey } from '../../lib/equipo/demoData';

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

// Chip de rol tonal. Propietario lleva el acento de marca (jerarquía visual).
const ROLE_STYLE: Record<RoleKey, string> = {
  propietario: 'bg-accent-soft text-[#b35400]',
  administrador: 'bg-[#e8f0fe] text-[#1a56b0]',
  coordinador: 'bg-[#efe9fb] text-[#6b3fb8]',
  recepcion: 'bg-[#e3f4f1] text-[#0f7a6b]',
  lectura: 'bg-surface-container text-muted',
};

const STATUS_STYLE: Record<StaffStatus, { chip: string; dot: string }> = {
  activo: { chip: 'bg-success-bg text-success-fg', dot: 'bg-success-fg' },
  pendiente: { chip: 'bg-accent-soft text-[#b35400]', dot: 'bg-brand-accent' },
  inactivo: { chip: 'bg-surface-container text-faint', dot: 'bg-[#9aa0ad]' },
};

export interface StaffTableProps {
  members: StaffMember[];
}

// Tabla del equipo · avatar con iniciales + email, chip de rol, estado con punto
// y último acceso. En mobile se oculta el último acceso. Server Component, datos
// demo (no PII real).
export function StaffTable({ members }: StaffTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
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
              const st = STATUS_STYLE[m.status];
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
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${st.chip}`}>
                      <span className={`h-[7px] w-[7px] rounded-full ${st.dot}`} />
                      {m.statusLabel}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-[13px] text-muted md:table-cell">{m.lastActive}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-right">
                    <a href="#" className="text-[13px] font-semibold text-brand">Gestionar</a>
                    <button type="button" aria-label="Más acciones" className="ml-2 align-middle text-faint hover:text-muted">
                      <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
