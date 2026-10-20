'use client';

// DataTableClient — variante cliente con callbacks onRowClick/onPrev/onNext.
// Filas interactivas: tabIndex=0, Enter y Espacio disparan onRowClick.

import type { ReactNode } from 'react';
import { DataTableView, type DataTableColumn, type DataTableViewProps } from './DataTableView';

export type { DataTableColumn };

export interface DataTableClientPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  hrefPrev?: string;
  hrefNext?: string;
}

export interface DataTableClientProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  error?: ReactNode;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
  pagination?: DataTableClientPaginationProps;
  mobileCard?: DataTableViewProps<T>['mobileCard'];
  className?: string;
  ariaLabel?: string;
}

export function DataTableClient<T>({
  data, columns, getRowId, loading, empty, error,
  onRowClick, selectedRowId, pagination, mobileCard, className, ariaLabel,
}: DataTableClientProps<T>) {
  return (
    <DataTableView
      data={data}
      columns={columns}
      getRowId={getRowId}
      loading={loading}
      empty={empty}
      error={error}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      pagination={pagination}
      mobileCard={mobileCard}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}
