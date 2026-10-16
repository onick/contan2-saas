'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePathnameSafe, useSearchParamsSafe } from '../../lib/navigation/safe';
import { ListFilter } from 'lucide-react';
import type { UserCohort } from '@contan2/contracts';
import { parseCohort, patchSearchParams } from '../../lib/admin/list-params';
import {
  Button,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '../ui';

const COHORT_OPTIONS = ['all', 'frequent', 'new7d', 'noEmail', 'noCredential'] as const;
type ShownCohort = typeof COHORT_OPTIONS[number];

const LABELS: Record<ShownCohort, string> = {
  all: 'Todos',
  frequent: 'Frecuentes',
  new7d: 'Nuevos (7 días)',
  noEmail: 'Sin email',
  noCredential: 'Sin credencial',
};

export function CohortFilterButton() {
  const router = useRouter();
  const pathname = usePathnameSafe();
  const sp = useSearchParamsSafe();
  const [, startTransition] = useTransition();
  const raw = parseCohort(sp.get('cohort') ?? undefined);
  const active: ShownCohort = (COHORT_OPTIONS as readonly string[]).includes(raw) ? (raw as ShownCohort) : 'all';

  function select(cohort: UserCohort) {
    const qs = patchSearchParams(sp, { cohort: cohort === 'all' ? undefined : cohort }, { resetPage: true });
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <ListFilter size={14} aria-hidden="true" />
          {active !== 'all' ? `Grupo · ${LABELS[active]}` : 'Grupo'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {COHORT_OPTIONS.map((c) => (
          <DropdownMenuItem key={c} onSelect={() => select(c)}>
            {LABELS[c]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
