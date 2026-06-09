'use client';

// components/usuarios/CohortPills.tsx · cohortes de usuarios como pills. La URL es
// la fuente de verdad (igual que SearchBar): al elegir una cohorte reescribe
// `?cohort=` y RESETEA `page`. Compatible con la búsqueda (preserva `q`). Los
// conteos vienen del endpoint facets (exactos, dentro de la búsqueda vigente);
// si faltan, las pills siguen navegables sin número.

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { USER_COHORTS, type UserCohort, type UsersFacetsResponse } from '@contan2/contracts';
import { patchSearchParams, parseCohort } from '../../lib/admin/list-params';
import { cn, focusRing } from '../ui';

const LABELS: Record<UserCohort, string> = {
  all: 'Todos',
  frequent: 'Frecuentes',
  new7d: 'Nuevos (7 días)',
  noEmail: 'Sin email',
  noCredential: 'Sin credencial',
  active: 'Activos',
  dormant: 'Inactivos',
};

export interface CohortPillsProps {
  counts: UsersFacetsResponse['counts'] | null;
}

export function CohortPills({ counts }: CohortPillsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const active = parseCohort(sp.get('cohort') ?? undefined);

  function select(cohort: UserCohort) {
    // 'all' se omite de la URL (estado por defecto). Reset de page → vuelve a 1.
    const qs = patchSearchParams(sp, { cohort: cohort === 'all' ? undefined : cohort }, { resetPage: true });
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div
      role="group"
      aria-label="Filtrar por cohorte"
      aria-busy={pending}
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {USER_COHORTS.map((c) => {
        const isActive = c === active;
        const count = counts ? counts[c] : null;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={isActive}
            onClick={() => select(c)}
            className={cn(
              'inline-flex flex-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
              focusRing,
              isActive
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-muted hover:bg-page hover:text-ink',
            )}
          >
            {LABELS[c]}
            {count !== null ? (
              <span
                className={cn(
                  'min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums',
                  isActive ? 'bg-white/20 text-white' : 'bg-surface-container text-faint',
                )}
              >
                {count.toLocaleString('en-US')}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
