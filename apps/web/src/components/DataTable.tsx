import React from 'react';

export interface Column<T> {
  header: string;
  accessor?: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading,
  emptyMessage = 'No items found',
  pagination,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-8 text-center text-[var(--color-text-muted)] animate-pulse">
        Loading data...
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-card)]">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-[var(--color-text-primary)]">
          <thead className="bg-[var(--color-bg-overlay)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} className={`px-4 py-3.5 ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-[var(--color-text-muted)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className="hover:bg-[var(--color-bg-overlay)]/50 transition-colors"
                >
                  {columns.map((col, idx) => (
                    <td key={idx} className={`px-4 py-3 align-middle ${col.className || ''}`}>
                      {typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : col.accessor
                        ? (row[col.accessor] as React.ReactNode)
                        : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--color-bg-overlay)]/30 border-t border-[var(--color-border)] text-xs">
          <span className="text-[var(--color-text-muted)]">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-bg-surface)] transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-bg-surface)] transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
