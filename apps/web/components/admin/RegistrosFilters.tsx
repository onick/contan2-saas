'use client';

// components/admin/RegistrosFilters.tsx · filtros server-side de Registros:
// actividad (REAL del tenant), rango de fechas y "Limpiar filtros". La URL es la
// fuente de verdad; cada cambio resetea `page`. Se puede limpiar cada filtro por
// separado (opción "Todas" / vaciar la fecha) o todos juntos.

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';
import { patchSearchParams } from '../../lib/admin/list-params';

export interface ActivityOption {
  id: string;
  name: string;
}

export function RegistrosFilters({ activities }: { activities: ActivityOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activityId = sp.get('activityId') ?? '';
  const dateFrom = sp.get('dateFrom') ?? '';
  const dateTo = sp.get('dateTo') ?? '';
  const hasFilters = Boolean(activityId || dateFrom || dateTo || sp.get('q'));

  const navigate = (patch: Record<string, string | undefined>) => {
    const qs = patchSearchParams(sp, patch, { resetPage: true });
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const field = cn('h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink', focusRing);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Filtrar por actividad"
        value={activityId}
        disabled={pending}
        onChange={(e) => navigate({ activityId: e.target.value || undefined })}
        className={cn(field, 'max-w-[220px]')}
      >
        <option value="">Todas las actividades</option>
        {activities.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      <label className="inline-flex items-center gap-1.5 text-[13px] text-muted">
        <span className="text-faint">Desde</span>
        <input
          type="date"
          aria-label="Fecha desde"
          value={dateFrom}
          max={dateTo || undefined}
          disabled={pending}
          onChange={(e) => navigate({ dateFrom: e.target.value || undefined })}
          className={field}
        />
      </label>
      <label className="inline-flex items-center gap-1.5 text-[13px] text-muted">
        <span className="text-faint">Hasta</span>
        <input
          type="date"
          aria-label="Fecha hasta"
          value={dateTo}
          min={dateFrom || undefined}
          disabled={pending}
          onChange={(e) => navigate({ dateTo: e.target.value || undefined })}
          className={field}
        />
      </label>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => navigate({ activityId: undefined, dateFrom: undefined, dateTo: undefined, q: undefined })}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted hover:bg-surface-container hover:text-ink',
            focusRing,
          )}
        >
          <X size={15} strokeWidth={2} aria-hidden="true" /> Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}
