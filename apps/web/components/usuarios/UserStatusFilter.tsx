'use client';

// components/usuarios/UserStatusFilter.tsx · filtro Activos/Archivados/Todos (F2D).
// La URL es la fuente de verdad (?status=); 'active' es el default y se omite.
// Resetea page al cambiar. Preserva q/cohorte.

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { parseUserStatus, patchSearchParams, type UserStatusFilter } from '../../lib/admin/list-params';
import { cn, focusRing } from '../ui';

const OPTS: { key: UserStatusFilter; label: string }[] = [
  { key: 'active', label: 'Activos' },
  { key: 'archived', label: 'Archivados' },
  { key: 'all', label: 'Todos' },
];

export function UserStatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const active = parseUserStatus(sp.get('status') ?? undefined);

  function select(s: UserStatusFilter) {
    const qs = patchSearchParams(sp, { status: s === 'active' ? undefined : s }, { resetPage: true });
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div role="group" aria-label="Filtrar por estado de archivado" aria-busy={pending} className="inline-flex flex-none rounded-lg border border-line bg-surface p-0.5">
      {OPTS.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === active} onClick={() => select(o.key)}
          className={cn('rounded-md px-3 py-1 text-[13px] font-semibold transition-colors', focusRing,
            o.key === active ? 'bg-brand text-white' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
