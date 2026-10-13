// DataTableView — markup compartido para DataTable (servidor) y DataTableClient (cliente).
// Sin hooks de estado; los comportamientos interactivos se inyectan vía props.
// col.cell(row) se llama una única vez por celda: se pre-computa en rowsWithCells
// y luego se reutiliza en las vistas desktop y móvil.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { Skeleton } from './Skeleton';

type ColumnPriority = 'always' | 'md' | 'lg';

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  priority?: ColumnPriority;
  width?: number | string;
}

export interface DataTableViewPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  hrefPrev?: string;
  hrefNext?: string;
}

export interface DataTableViewProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  error?: ReactNode;
  onRowClick?: (row: T) => void;
  pagination?: DataTableViewPaginationProps;
  mobileCard?: (row: T, cells: ReactNode[]) => ReactNode;
  className?: string;
  ariaLabel?: string;
}

const PRIORITY_CLS: Record<ColumnPriority, string> = {
  always: '',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

const ALIGN_CLS = { left: 'text-left', center: 'text-center', right: 'text-right' };

function PaginationBar({
  page, pageSize, total, onPrev, onNext, hrefPrev, hrefNext,
}: DataTableViewPaginationProps) {
  const fmt = new Intl.NumberFormat('es-DO');
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const canPrev = page > 1;
  const canNext = end < total;

  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-muted">
      <span>
        Mostrando{' '}
        <span className="num">{fmt.format(start)}–{fmt.format(end)}</span>{' '}
        de{' '}
        <span className="num">{fmt.format(total)}</span>
      </span>
      <div className="flex items-center gap-1">
        {hrefPrev ? (
          <Link
            href={canPrev ? hrefPrev : '#'}
            aria-label="Página anterior"
            aria-disabled={!canPrev}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg border border-line transition-colors',
              canPrev ? 'hover:bg-surface-container text-ink' : 'pointer-events-none opacity-40',
            )}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Página anterior"
            aria-disabled={!canPrev}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg border border-line transition-colors',
              canPrev ? 'hover:bg-surface-container text-ink' : 'pointer-events-none opacity-40',
            )}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        )}
        {hrefNext ? (
          <Link
            href={canNext ? hrefNext : '#'}
            aria-label="Página siguiente"
            aria-disabled={!canNext}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg border border-line transition-colors',
              canNext ? 'hover:bg-surface-container text-ink' : 'pointer-events-none opacity-40',
            )}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            aria-label="Página siguiente"
            aria-disabled={!canNext}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg border border-line transition-colors',
              canNext ? 'hover:bg-surface-container text-ink' : 'pointer-events-none opacity-40',
            )}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

export function DataTableView<T>({
  data, columns, getRowId, loading = false, empty, error,
  onRowClick, pagination, mobileCard, className, ariaLabel,
}: DataTableViewProps<T>) {
  const alwaysCols = columns.filter((c) => !c.priority || c.priority === 'always');
  const isInteractive = !!onRowClick;
  const showFallback = loading || !!error || data.length === 0;

  // col.cell(row) se llama aquí una única vez: el resultado se reutiliza en
  // la vista desktop (tabla) y en la vista móvil (tarjeta) sin re-invocar.
  const rowsWithCells = !showFallback
    ? data.map((row) => ({ row, id: getRowId(row), cells: columns.map((col) => col.cell(row)) }))
    : [];

  // Índices de columnas "always" dentro del array `columns` (para la tarjeta móvil).
  const alwaysIndices = alwaysCols.map((ac) => columns.findIndex((c) => c.id === ac.id));

  const rowInteractionProps = (row: T) =>
    isInteractive
      ? {
          onClick: () => onRowClick(row),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }
          },
          tabIndex: 0,
        }
      : {};

  return (
    <div className={cn('rounded-card border border-line bg-surface', className)}>
      {/* Desktop table — oculto en móvil */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed" aria-label={ariaLabel}>
          <thead>
            <tr className="border-b border-line bg-surface-container">
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-4 py-3 text-[13px] font-medium text-muted',
                    PRIORITY_CLS[col.priority ?? 'always'],
                    ALIGN_CLS[col.align ?? 'left'],
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {columns.map((col) => (
                    <td key={col.id} className={cn('px-4 py-3', PRIORITY_CLS[col.priority ?? 'always'])}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center">{error}</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center">{empty}</td></tr>
            ) : (
              rowsWithCells.map(({ row, id, cells }) => (
                <tr
                  key={id}
                  {...rowInteractionProps(row)}
                  className={cn(
                    'border-b border-line last:border-0',
                    isInteractive && 'cursor-pointer hover:bg-surface-container focus-visible:bg-surface-container',
                  )}
                >
                  {columns.map((col, ci) => (
                    <td
                      key={col.id}
                      className={cn(
                        'min-w-0 truncate px-4 py-3 text-[14px] text-ink',
                        PRIORITY_CLS[col.priority ?? 'always'],
                        ALIGN_CLS[col.align ?? 'left'],
                      )}
                      title={typeof cells[ci] === 'string' ? (cells[ci] as string) : undefined}
                    >
                      {cells[ci]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — oculto en md+ */}
      <div className="md:hidden">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-card" />
            ))}
          </div>
        ) : error ? (
          <div className="px-4 py-12 text-center">{error}</div>
        ) : data.length === 0 ? (
          <div className="px-4 py-12 text-center">{empty}</div>
        ) : (
          <ul>
            {rowsWithCells.map(({ row, id, cells }) => {
              const card = mobileCard
                ? mobileCard(row, cells)
                : (
                  <div className="flex flex-col gap-1 p-4">
                    {alwaysCols.map((col, i) => (
                      <div key={col.id} className="flex items-start gap-2">
                        <span className="min-w-[6rem] text-[12px] font-medium text-muted">{col.header}</span>
                        <span className="min-w-0 text-[14px] text-ink">{cells[alwaysIndices[i]!]}</span>
                      </div>
                    ))}
                  </div>
                );
              return (
                <li
                  key={id}
                  {...rowInteractionProps(row)}
                  className={cn(
                    'border-b border-line last:border-0',
                    isInteractive && 'cursor-pointer hover:bg-surface-container focus-visible:bg-surface-container',
                  )}
                >
                  {card}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pagination && !showFallback ? <PaginationBar {...pagination} /> : null}
    </div>
  );
}
