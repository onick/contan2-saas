// DataTable — apto para servidor: sin onRowClick/onPrev/onNext.
// Paginación via hrefPrev/hrefNext (next/link en DataTableView). Sin hooks.
// Para filas interactivas con callbacks, usar DataTableClient.

import type { ReactNode } from 'react';
import { DataTableView, type DataTableColumn, type DataTableViewProps } from './DataTableView';

export type { DataTableColumn };

export interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
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
  pagination?: DataTablePaginationProps;
  mobileCard?: DataTableViewProps<T>['mobileCard'];
  className?: string;
  ariaLabel?: string;
}

export function DataTable<T>({
  data, columns, getRowId, loading, empty, error,
  pagination, mobileCard, className, ariaLabel,
}: DataTableProps<T>) {
  return (
    <DataTableView
      data={data}
      columns={columns}
      getRowId={getRowId}
      loading={loading}
      empty={empty}
      error={error}
      pagination={pagination}
      mobileCard={mobileCard}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}
