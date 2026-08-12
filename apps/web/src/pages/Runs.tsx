import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRuns, useCancelRun } from '../hooks/useRuns';
import { DataTable, Column } from '../components/DataTable';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { CollectionRun, RunStatus } from '@odp/shared-types';
import { formatDuration } from '../lib/utils';
import { Link } from 'react-router-dom';
import { XCircle } from 'lucide-react';

export const Runs: React.FC = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, isLoading } = useRuns({
    page,
    pageSize: 15,
    status: statusFilter || undefined,
  });
  const cancelRun = useCancelRun();

  const columns: Column<CollectionRun>[] = [
    {
      header: t('runs.fields.runId'),
      accessor: (r) => (
        <Link
          to={`/runs/${r.id}`}
          className="font-mono text-xs font-semibold text-[var(--color-brand-400)] hover:underline"
        >
          {r.runId}
        </Link>
      ),
    },
    {
      header: t('runs.fields.source'),
      accessor: (r) => r.source?.name || '—',
    },
    {
      header: t('runs.fields.collector'),
      accessor: (r) => r.collector?.name || '—',
    },
    {
      header: t('runs.fields.status'),
      accessor: (r) => <RunStatusBadge status={r.status} />,
    },
    {
      header: t('runs.fields.filesDownloaded'),
      accessor: (r) => <span className="font-mono">{r.filesDownloaded}</span>,
    },
    {
      header: t('runs.fields.filesDuplicate'),
      accessor: (r) => (
        <span className="font-mono text-[var(--color-warning-400)]">{r.filesDuplicate}</span>
      ),
    },
    {
      header: t('runs.fields.filesFailed'),
      accessor: (r) => (
        <span className="font-mono text-[var(--color-error-400)]">{r.filesFailed}</span>
      ),
    },
    {
      header: t('runs.fields.duration'),
      accessor: (r) => (
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {formatDuration(r.startedAt, r.completedAt)}
        </span>
      ),
    },
    {
      header: t('common.actions'),
      accessor: (r) =>
        r.status === RunStatus.RUNNING || r.status === RunStatus.PENDING ? (
          <button
            onClick={() => cancelRun.mutate(r.id)}
            disabled={cancelRun.isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--color-error-bg)] text-[var(--color-error-400)] border border-[var(--color-error-500)]/30 rounded-[var(--radius-md)] text-xs font-medium hover:bg-[var(--color-error-500)] hover:text-white transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            {t('runs.cancel')}
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t('runs.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('runs.subtitle')}</p>
        </div>

        {/* Filter dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="RUNNING">Running</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data || []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyMessage="No collection runs found."
        pagination={
          data
            ? {
                page,
                totalPages: data.totalPages,
                onPageChange: setPage,
              }
            : undefined
        }
      />
    </div>
  );
};
