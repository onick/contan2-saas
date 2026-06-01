import { Check } from 'lucide-react';
import type { Role } from '../../lib/equipo/demoData';

export interface RoleCardProps {
  role: Role;
}

// Tarjeta de rol · ícono tonal + nombre + conteo de miembros, descripción y
// lista de permisos con check. Server Component. Sin PII (solo metadatos de rol).
export function RoleCard({ role }: RoleCardProps) {
  const RoleIcon = role.icon;
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-[#b35400]">
            <RoleIcon size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">{role.label}</h3>
        </div>
        <span className="flex-none rounded-full bg-surface-container px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted">
          {role.members} {role.members === 1 ? 'miembro' : 'miembros'}
        </span>
      </div>

      <p className="mt-3 text-[13px] text-muted">{role.description}</p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {role.permissions.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[13px] text-ink">
            <Check size={15} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 flex-none text-success-fg" />
            <span className="min-w-0">{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="text-[11px] text-faint">Permisos predefinidos</span>
        <a href="#" className="text-[13px] font-semibold text-brand">Ver detalle</a>
      </div>
    </section>
  );
}
