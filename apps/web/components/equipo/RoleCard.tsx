import { Check } from 'lucide-react';
import type { Role } from '../../lib/equipo/demoData';
import { Card, Chip, cn, focusRing } from '../ui';

export interface RoleCardProps {
  role: Role;
}

// Tarjeta de rol · ícono tonal + nombre + conteo de miembros, descripción y
// lista de permisos con check. Server Component. Sin PII (solo metadatos de rol).
export function RoleCard({ role }: RoleCardProps) {
  const RoleIcon = role.icon;
  return (
    <Card as="article" padding="md" className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-[#b35400]">
            <RoleIcon size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">{role.label}</h3>
        </div>
        <Chip tone="neutral" className="flex-none tabular-nums">
          {role.members} {role.members === 1 ? 'miembro' : 'miembros'}
        </Chip>
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
        <a href="#" className={cn('rounded px-1 text-[13px] font-semibold text-brand', focusRing)}>Ver detalle</a>
      </div>
    </Card>
  );
}
