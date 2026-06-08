'use client';

// components/admin/Pagination.tsx · paginación server-side. La URL es la fuente
// de verdad: prev/next escriben `?page=`; el selector escribe `?pageSize=` y
// RESETEA `page` a 1. Resumen "X–Y de N" en aria-live. Mantiene el contenido
// anterior visible durante la navegación (useTransition).

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, focusRing } from '../ui/cn';
import { PAGE_SIZES, patchSearchParams, totalPages } from '../../lib/admin/list-params';

export interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
}

export function Pagination({ total, page, pageSize }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const pages = totalPages(total, pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const navigate = (patch: Record<string, string | undefined>, resetPage = false) => {
    const qs = patchSearchParams(sp, patch, { resetPage });
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const btn =
    'grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted ' +
    'enabled:hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
      <label className="inline-flex items-center gap-2">
        <span>Filas por página</span>
        <select
          value={pageSize}
          onChange={(e) => navigate({ pageSize: e.target.value }, true)}
          disabled={pending}
          className={cn(
            'h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink tabular-nums',
            focusRing,
          )}
          aria-label="Filas por página"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      <div className="inline-flex items-center gap-3">
        <span className="tabular-nums" role="status" aria-live="polite">
          {total === 0 ? 'Sin resultados' : `Mostrando ${from}–${to} de ${total.toLocaleString('en-US')}`}
        </span>
        <span className="inline-flex gap-1">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={pending || page <= 1}
            onClick={() => navigate({ page: String(page - 1) })}
            className={cn(btn, focusRing)}
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Página siguiente"
            disabled={pending || page >= pages}
            onClick={() => navigate({ page: String(page + 1) })}
            className={cn(btn, focusRing)}
          >
            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  );
}
