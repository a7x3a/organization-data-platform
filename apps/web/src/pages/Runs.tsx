import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRuns, useCancelRun, useDeleteRun } from '../hooks/useRuns';
import { DataTable, Column } from '../components/DataTable';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { Button } from '../components/Button';
import { Select } from '../components/Input';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CollectionRun, RunStatus } from '@odp/shared-types';
import { formatDuration } from '../lib/utils';
import { Link } from 'react-router-dom';
import { XCircle, Trash2 } from 'lucide-react';

const ACTIVE_STATUSES = new Set([RunStatus.PENDING, RunStatus.RUNNING, 'CANCEL_REQUESTED']);

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
  const deleteRun = useDeleteRun();
  const [runToDelete, setRunToDelete] = useState<CollectionRun | null>(null);

  const handleDeleteConfirmed = async () => {
    if (!runToDelete) return;
    await deleteRun.mutateAsync(runToDelete.id);
    setRunToDelete(null);
  };

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
        ACTIVE_STATUSES.has(r.status) ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => cancelRun.mutate(r.id)}
            disabled={cancelRun.isPending}
          >
            <XCircle className="w-3.5 h-3.5" />
            {t('runs.cancel')}
          </Button>
        ) : (
          <Button
            variant="danger"
            size="sm"
            iconOnly
            onClick={() => setRunToDelete(r)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('runs.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('runs.subtitle')}</p>
        </div>

        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-40"
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'RUNNING', label: 'Running' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'FAILED', label: 'Failed' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
        />
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

      <ConfirmDialog
        isOpen={!!runToDelete}
        title={t('runs.delete')}
        message={t('runs.deleteConfirm')}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setRunToDelete(null)}
        isLoading={deleteRun.isPending}
      />
    </div>
  );
};
