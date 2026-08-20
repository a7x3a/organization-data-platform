import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRuns, useCancelRun, usePauseRun, useResumeRun, useForceCancelRun, useDeleteRun, useApproveRun, useRejectRun } from '../hooks/useRuns';
import { useAuth } from '../hooks/useAuth';
import { DataTable, Column } from '../components/DataTable';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { Button } from '../components/Button';
import { Select } from '../components/Input';
import { CollectionRun, RunStatus, ApprovalStatus, UserRole } from '@odp/shared-types';
import { LiveDuration } from '../components/LiveDuration';
import { Link } from 'react-router-dom';
import { XCircle, Trash2, Zap, Pause, Play, CheckCircle2, AlertCircle, Clock, Lock, ShieldCheck, AlertTriangle } from 'lucide-react';

const ACTIVE_STATUSES = new Set([RunStatus.PENDING, RunStatus.RUNNING, RunStatus.PAUSED, 'CANCEL_REQUESTED']);

export const Runs: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes(UserRole.ADMIN);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [approvalFilter, setApprovalFilter] = useState<string>('');
  const { data, isLoading } = useRuns({
    page,
    pageSize: 15,
    status: statusFilter || undefined,
    approvalStatus: approvalFilter || undefined,
  } as any);
  const cancelRun = useCancelRun();
  const pauseRun = usePauseRun();
  const resumeRun = useResumeRun();
  const forceCancelRun = useForceCancelRun();
  const deleteRun = useDeleteRun();
  const approveRun = useApproveRun();
  const rejectRun = useRejectRun();

  const [runToDelete, setRunToDelete] = useState<CollectionRun | null>(null);
  const [runToReview, setRunToReview] = useState<{ run: CollectionRun; action: 'APPROVE' | 'REJECT' } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const canManage = (r: CollectionRun) => {
    return isAdmin || !r.createdById || r.createdById === user?.id;
  };

  const handleConfirmReview = async () => {
    if (!runToReview) return;
    if (runToReview.action === 'APPROVE') {
      await approveRun.mutateAsync({ id: runToReview.run.id, notes: reviewNotes });
    } else {
      await rejectRun.mutateAsync({ id: runToReview.run.id, notes: reviewNotes });
    }
    setRunToReview(null);
    setReviewNotes('');
  };

  const columns: Column<CollectionRun>[] = [
    {
      header: t('runs.fields.runId'),
      className: 'whitespace-nowrap',
      accessor: (r) => (
        <Link
          to={`/runs/${r.id}`}
          className="font-mono text-xs font-semibold text-[var(--color-brand-400)] hover:underline flex items-center gap-1.5 whitespace-nowrap"
        >
          {r.runId}
          {!canManage(r) && (
            <span title="View Only: Launched by another user" className="text-[var(--color-text-muted)]">
              <Lock className="w-3 h-3 opacity-60" />
            </span>
          )}
        </Link>
      ),
    },
    {
      header: t('runs.fields.source'),
      className: 'max-w-[130px]',
      accessor: (r) => (
        <div className="text-xs text-[var(--color-text-primary)] truncate max-w-[130px]" title={r.source?.name || '—'}>
          {r.source?.name || '—'}
        </div>
      ),
    },
    {
      header: t('runs.fields.collector'),
      className: 'max-w-[150px]',
      accessor: (r) => (
        <div className="text-xs text-[var(--color-text-primary)] truncate max-w-[150px]" title={r.collector?.name || '—'}>
          {r.collector?.name || '—'}
        </div>
      ),
    },
    {
      header: 'User',
      className: 'whitespace-nowrap',
      accessor: (r: any) => (
        <span className="text-xs text-[var(--color-text-secondary)] font-medium whitespace-nowrap">
          {r.createdBy?.name || r.createdBy?.username || 'Automated'}
        </span>
      ),
    },
    {
      header: t('runs.fields.status'),
      className: 'whitespace-nowrap',
      accessor: (r) => <RunStatusBadge status={r.status} />,
    },
    {
      header: 'Review',
      className: 'whitespace-nowrap text-center',
      accessor: (r: any) => {
        const appStatus = r.approvalStatus || 'PENDING';
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap font-mono border ${
              appStatus === 'APPROVED'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : appStatus === 'REJECTED'
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {appStatus === 'APPROVED' ? (
              <>
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Approved
              </>
            ) : appStatus === 'REJECTED' ? (
              <>
                <AlertCircle className="w-3 h-3 shrink-0" /> Rejected
              </>
            ) : (
              <>
                <Clock className="w-3 h-3 shrink-0" /> In Review
              </>
            )}
          </span>
        );
      },
    },
    {
      header: 'Files',
      className: 'whitespace-nowrap text-right',
      accessor: (r) => <span className="font-mono text-xs text-right block">{r.filesDownloaded}</span>,
    },
    {
      header: 'Dup',
      className: 'whitespace-nowrap text-right',
      accessor: (r) => (
        <span className="font-mono text-xs text-[var(--color-warning-400)] text-right block">{r.filesDuplicate}</span>
      ),
    },
    {
      header: 'Fail',
      className: 'whitespace-nowrap text-right',
      accessor: (r) => (
        <span className="font-mono text-xs text-[var(--color-error-400)] text-right block">{r.filesFailed}</span>
      ),
    },
    {
      header: t('runs.fields.duration'),
      className: 'whitespace-nowrap',
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
      className: 'whitespace-nowrap text-right',
      accessor: (r) => {
        const allowed = canManage(r);
        if (!allowed) {
          return (
            <span className="text-[10px] text-[var(--color-text-muted)] italic font-mono whitespace-nowrap">
              View Only
            </span>
          );
        }

        return ACTIVE_STATUSES.has(r.status) ? (
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
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('runs.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('runs.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={approvalFilter}
            onValueChange={setApprovalFilter}
            className="w-40"
            options={[
              { value: '', label: 'All Reviews' },
              { value: 'PENDING', label: 'In Review' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
            ]}
          />
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

      {/* Run Review & Approval Modal */}
      {runToReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="relative w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              {runToReview.action === 'APPROVE' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              )}
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {runToReview.action === 'APPROVE' ? 'Approve Collection Run' : 'Reject Collection Run'}
              </h2>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              {runToReview.action === 'APPROVE'
                ? `Confirm quality review and approve dataset files for run `
                : `Mark collection run `}
              <strong className="font-mono text-[var(--color-text-primary)]">{runToReview.run.runId}</strong>.
            </p>

            <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-xs space-y-1 font-mono">
              <div>Source: <span className="text-[var(--color-text-primary)]">{runToReview.run.source?.name || '—'}</span></div>
              <div>Files Downloaded: <span className="text-emerald-400">{runToReview.run.filesDownloaded}</span></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Review Notes (Optional)</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="e.g. Verified files & manifest quality..."
                rows={2}
                className="w-full text-xs p-3 rounded-lg bg-[var(--color-bg-overlay)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-400)]"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRunToReview(null)}
                disabled={approveRun.isPending || rejectRun.isPending}
              >
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={runToReview.action === 'APPROVE' ? 'primary' : 'danger'}
                  size="sm"
                  onClick={handleConfirmReview}
                  disabled={approveRun.isPending || rejectRun.isPending}
                >
                  {runToReview.action === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
