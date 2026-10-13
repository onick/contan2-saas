'use client';

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ListFilter } from 'lucide-react';
import { parseUserStatus, patchSearchParams, type UserStatusFilter } from '../../lib/admin/list-params';
import {
  Button,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../ui';

const OPTS: { key: UserStatusFilter; label: string }[] = [
  { key: 'active', label: 'Activos' },
  { key: 'archived', label: 'Archivados' },
  { key: 'all', label: 'Todos' },
];

export function EstadoFilterButton() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const active = parseUserStatus(sp.get('status') ?? undefined);

  function select(s: UserStatusFilter) {
    const qs = patchSearchParams(sp, { status: s === 'active' ? undefined : s }, { resetPage: true });
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <ListFilter size={14} aria-hidden="true" />
          {active !== 'active' ? `Estado · ${OPTS.find((o) => o.key === active)?.label ?? active}` : 'Estado'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {OPTS.map((o) => (
          <DropdownMenuItem key={o.key} onSelect={() => select(o.key)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
