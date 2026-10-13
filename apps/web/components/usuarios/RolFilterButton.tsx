'use client';

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ListFilter } from 'lucide-react';
import { USER_COHORTS, type UserCohort } from '@contan2/contracts';
import { parseCohort, patchSearchParams } from '../../lib/admin/list-params';
import {
  Button,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../ui';

const LABELS: Record<UserCohort, string> = {
  all: 'Todos',
  frequent: 'Frecuentes',
  new7d: 'Nuevos (7 días)',
  noEmail: 'Sin email',
  noCredential: 'Sin credencial',
  active: 'Activos',
  dormant: 'Inactivos',
};

export function RolFilterButton() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const active = parseCohort(sp.get('cohort') ?? undefined);

  function select(cohort: UserCohort) {
    const qs = patchSearchParams(sp, { cohort: cohort === 'all' ? undefined : cohort }, { resetPage: true });
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <ListFilter size={14} aria-hidden="true" />
          {active !== 'all' ? `Rol · ${LABELS[active]}` : 'Rol'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {USER_COHORTS.map((c) => (
          <DropdownMenuItem key={c} onSelect={() => select(c)}>
            {LABELS[c]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
