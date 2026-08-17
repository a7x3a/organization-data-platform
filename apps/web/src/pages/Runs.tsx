import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRuns, useCancelRun, usePauseRun, useResumeRun, useForceCancelRun, useDeleteRun } from '../hooks/useRuns';
import { DataTable, Column } from '../components/DataTable';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { Button } from '../components/Button';
import { Select } from '../components/Input';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CollectionRun, RunStatus } from '@odp/shared-types';
import { formatDuration } from '../lib/utils';
import { LiveDuration } from '../components/LiveDuration';
import { Link } from 'react-router-dom';
import { XCircle, Trash2, Zap, Pause, Play } from 'lucide-react';

const ACTIVE_STATUSES = new Set([RunStatus.PENDING, RunStatus.RUNNING, RunStatus.PAUSED, 'CANCEL_REQUESTED']);

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
  const pauseRun = usePauseRun();
  const resumeRun = useResumeRun();
  const forceCancelRun = useForceCancelRun();
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
        <LiveDuration
          startedAt={r.startedAt}
          completedAt={r.completedAt}
          status={r.status}
        />
      ),
    },
    {
      header: t('common.actions'),
      accessor: (r) =>
        ACTIVE_STATUSES.has(r.status) ? (
          <div className="flex items-center gap-1.5">
            {r.status === 'PAUSED' ? (
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                title="Resume Run"
                onClick={() => resumeRun.mutate(r.id)}
                disabled={resumeRun.isPending}
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                title="Pause Run"
                onClick={() => pauseRun.mutate(r.id)}
                disabled={pauseRun.isPending}
              >
                <Pause className="w-3.5 h-3.5 text-amber-400" />
              </Button>
            )}
            <Button
              variant="warning"
              size="sm"
              iconOnly
              title={r.status === 'CANCEL_REQUESTED' ? 'Request Cancel Again' : 'Cancel Run'}
              onClick={() => cancelRun.mutate(r.id)}
              disabled={cancelRun.isPending}
            >
              <XCircle className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="danger"
              size="sm"
              iconOnly
              title="Force Stop & Purge Queue Job"
              onClick={() => forceCancelRun.mutate(r.id)}
              disabled={forceCancelRun.isPending}
            >
              <Zap className="w-3.5 h-3.5" />
            </Button>
          </div>
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

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)]">
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

      {/* Run Delete Options Modal */}
      {runToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="relative w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Delete Collection Run
              </h2>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              Choose how you want to delete <strong className="font-mono text-[var(--color-text-primary)]">{runToDelete.runId}</strong>:
            </p>

            <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-xs space-y-1 font-mono">
              <div>Source: <span className="text-[var(--color-text-primary)]">{runToDelete.source?.name || '—'}</span></div>
              <div>Files Downloaded: <span className="text-emerald-400">{runToDelete.filesDownloaded}</span></div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                disabled={deleteRun.isPending}
                onClick={async () => {
                  await deleteRun.mutateAsync({ id: runToDelete.id, deleteFiles: false });
                  setRunToDelete(null);
                }}
              >
                Delete Run Only (Keep Files)
              </Button>

              <Button
                type="button"
                variant="danger"
                size="sm"
                className="w-full justify-center"
                disabled={deleteRun.isPending}
                onClick={async () => {
                  await deleteRun.mutateAsync({ id: runToDelete.id, deleteFiles: true });
                  setRunToDelete(null);
                }}
              >
                Delete Run & All Downloaded Files
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-center mt-1 text-[var(--color-text-muted)]"
                onClick={() => setRunToDelete(null)}
                disabled={deleteRun.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
