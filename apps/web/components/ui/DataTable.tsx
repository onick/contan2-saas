// Client-only cuando se usan callbacks (onRowClick); sin callbacks es seguro en servidor.
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { EmptyState } from './EmptyState';
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

export interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  hrefPrev?: string;
  hrefNext?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  error?: ReactNode;
  onRowClick?: (row: T) => void;
  pagination?: DataTablePaginationProps;
  mobileCard?: (row: T) => ReactNode;
  className?: string;
  ariaLabel?: string;
}

const PRIORITY_CLS: Record<ColumnPriority, string> = {
  always: '',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

const ALIGN_CLS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function PaginationBar({ page, pageSize, total, onPrev, onNext, hrefPrev, hrefNext }: DataTablePaginationProps) {
  const fmt = new Intl.NumberFormat('es-DO');
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const canPrev = page > 1;
  const canNext = end < total;

  const PrevEl = hrefPrev ? 'a' : 'button';
  const NextEl = hrefNext ? 'a' : 'button';

  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-muted">
      <span>
        Mostrando{' '}
        <span className="num">{fmt.format(start)}–{fmt.format(end)}</span>{' '}
        de{' '}
        <span className="num">{fmt.format(total)}</span>
      </span>
      <div className="flex items-center gap-1">
        <PrevEl
          {...(hrefPrev ? { href: hrefPrev } : { type: 'button' as const, onClick: onPrev, disabled: !canPrev })}
          aria-label="Página anterior"
          aria-disabled={!canPrev}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-lg border border-line transition-colors',
            canPrev ? 'hover:bg-surface-container text-ink' : 'opacity-40 pointer-events-none',
          )}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </PrevEl>
        <NextEl
          {...(hrefNext ? { href: hrefNext } : { type: 'button' as const, onClick: onNext, disabled: !canNext })}
          aria-label="Página siguiente"
          aria-disabled={!canNext}
          className={cn(
            'grid h-8 w-8 place-items-center rounded-lg border border-line transition-colors',
            canNext ? 'hover:bg-surface-container text-ink' : 'opacity-40 pointer-events-none',
          )}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </NextEl>
      </div>
    </div>
  );
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  loading = false,
  empty,
  error,
  onRowClick,
  pagination,
  mobileCard,
  className,
  ariaLabel,
}: DataTableProps<T>) {
  const alwaysCols = columns.filter((c) => !c.priority || c.priority === 'always');

  const buildMobileCard = (row: T) => {
    if (mobileCard) return mobileCard(row);
    return (
      <div className="flex flex-col gap-1 p-4">
        {alwaysCols.map((col) => (
          <div key={col.id} className="flex items-start gap-2">
            <span className="min-w-[6rem] text-[12px] font-medium text-muted">{col.header}</span>
            <span className="min-w-0 text-[14px] text-ink">{col.cell(row)}</span>
          </div>
        ))}
      </div>
    );
  };

  const showFallback = loading || !!error || data.length === 0;

  return (
    <div className={cn('rounded-card border border-line bg-surface', className)}>
      {/* Desktop table — hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="table-fixed w-full" aria-label={ariaLabel}>
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
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  {error}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  {empty}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }
                  } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    'border-b border-line last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-surface-container focus-visible:bg-surface-container',
                  )}
                >
                  {columns.map((col) => {
                    const cell = col.cell(row);
                    return (
                      <td
                        key={col.id}
                        className={cn(
                          'min-w-0 truncate px-4 py-3 text-[14px] text-ink',
                          PRIORITY_CLS[col.priority ?? 'always'],
                          ALIGN_CLS[col.align ?? 'left'],
                        )}
                        title={typeof cell === 'string' ? cell : undefined}
                      >
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — hidden on md+ */}
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
            {data.map((row) => (
              <li
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }
                } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  'border-b border-line last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-container focus-visible:bg-surface-container',
                )}
              >
                {buildMobileCard(row)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pagination && !showFallback ? (
        <PaginationBar {...pagination} />
      ) : null}
    </div>
  );
}
