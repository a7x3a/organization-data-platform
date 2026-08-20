import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRun, useCancelRun, usePauseRun, useResumeRun, useForceCancelRun } from '../hooks/useRuns';
import { useAuth } from '../hooks/useAuth';
import {
  useFiles,
  useApproveFile,
  useRejectFile,
  useBulkApproveFiles,
  useBulkRejectFiles,
  useApproveRunFiles,
  useRejectRunFiles,
} from '../hooks/useFiles';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { FileApprovalBadge } from '../components/FileApprovalBadge';
import { DataTable, Column } from '../components/DataTable';
import { Button } from '../components/Button';
import {
  ArrowLeft,
  XCircle,
  AlertTriangle,
  Zap,
  Pause,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Lock,
  Download,
  Check,
  X,
  FileCheck,
} from 'lucide-react';
import { ApprovalStatus, CollectedFile, CollectorType, RunStatus, UserRole } from '@odp/shared-types';
import { formatBytes, truncateSha256 } from '../lib/utils';
import { downloadFile } from '../lib/downloadFile';
import { LiveDuration } from '../components/LiveDuration';
import { LogConsole } from '../components/LogConsole';

export const RunDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes(UserRole.ADMIN);

  const { data: run, isLoading } = useRun(id!);
  const isRunning =
    run ? (run.status === RunStatus.RUNNING || run.status === RunStatus.PENDING || run.status === RunStatus.PAUSED || run.status === RunStatus.CANCEL_REQUESTED) : false;

  const { data: filesData } = useFiles(
    { collectionRunId: id!, pageSize: 100 },
    { refetchInterval: isRunning ? 2000 : false }
  );

  const cancelRun = useCancelRun();
  const pauseRun = usePauseRun();
  const resumeRun = useResumeRun();
  const forceCancelRun = useForceCancelRun();

  const approveFile = useApproveFile();
  const rejectFile = useRejectFile();
  const bulkApprove = useBulkApproveFiles();
  const bulkReject = useBulkRejectFiles();
  const approveAllInRun = useApproveRunFiles();
  const rejectAllInRun = useRejectRunFiles();

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [approvalNote, setApprovalNote] = useState('');
  const [approvalTarget, setApprovalTarget] = useState<{
    action: 'APPROVE' | 'REJECT';
    scope: 'SINGLE' | 'BULK' | 'ALL';
    fileId?: string;
  } | null>(null);

  const canManage = run ? (isAdmin || !run.createdById || run.createdById === user?.id) : false;

  // Force re-render every 1 second when active so duration counter increments live
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (isLoading || !run) {
    return <div className="p-8 text-center text-[var(--color-text-muted)]">Loading run progress...</div>;
  }

  const files = filesData?.data || [];
  const approvedCount = files.filter((f) => f.approvalStatus === ApprovalStatus.APPROVED).length;
  const rejectedCount = files.filter((f) => f.approvalStatus === ApprovalStatus.REJECTED).length;
  const pendingCount = files.filter((f) => !f.approvalStatus || f.approvalStatus === ApprovalStatus.PENDING).length;

  const toggleSelectAll = () => {
    if (selectedFileIds.length === files.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(files.map((f) => f.id));
    }
  };

  const toggleSelectFile = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleDownload = async (fileId: string) => {
    try {
      await downloadFile(fileId);
    } catch {
      alert('Could not generate signed download URL');
    }
  };

  const handleConfirmApproval = async () => {
    if (!approvalTarget) return;

    if (approvalTarget.scope === 'SINGLE' && approvalTarget.fileId) {
      if (approvalTarget.action === 'APPROVE') {
        await approveFile.mutateAsync({ id: approvalTarget.fileId, notes: approvalNote });
      } else {
        await rejectFile.mutateAsync({ id: approvalTarget.fileId, notes: approvalNote });
      }
    } else if (approvalTarget.scope === 'BULK') {
      if (approvalTarget.action === 'APPROVE') {
        await bulkApprove.mutateAsync({ fileIds: selectedFileIds, notes: approvalNote });
      } else {
        await bulkReject.mutateAsync({ fileIds: selectedFileIds, notes: approvalNote });
      }
      setSelectedFileIds([]);
    } else if (approvalTarget.scope === 'ALL') {
      if (approvalTarget.action === 'APPROVE') {
        await approveAllInRun.mutateAsync({ runId: run.id, notes: approvalNote });
      } else {
        await rejectAllInRun.mutateAsync({ runId: run.id, notes: approvalNote });
      }
      setSelectedFileIds([]);
    }

    setApprovalTarget(null);
    setApprovalNote('');
  };

  const fileColumns: Column<CollectedFile>[] = [
    {
      header: (
        <input
          type="checkbox"
          checked={files.length > 0 && selectedFileIds.length === files.length}
          onChange={toggleSelectAll}
          className="rounded border-[var(--color-border)] cursor-pointer"
        />
      ),
      className: 'w-8 pl-3',
      accessor: (f) => (
        <input
          type="checkbox"
          checked={selectedFileIds.includes(f.id)}
          onChange={() => toggleSelectFile(f.id)}
          className="rounded border-[var(--color-border)] cursor-pointer"
        />
      ),
    },
    {
      header: 'File ID',
      accessor: (f) => <span className="font-mono text-xs text-[var(--color-brand-400)]">{f.fileId}</span>,
    },
    {
      header: 'File Name',
      accessor: (f) => (
        <div className="truncate max-w-xs" title={f.fileName}>
          <button
            type="button"
            onClick={() => {
              if (f.sourceUrl) {
                window.open(f.sourceUrl, '_blank', 'noopener,noreferrer');
              } else if (f.status === 'UPLOADED') {
                handleDownload(f.id);
              }
            }}
            className={`font-medium text-xs text-left truncate block ${
              f.sourceUrl || f.status === 'UPLOADED'
                ? 'text-[var(--color-text-primary)] hover:text-[var(--color-brand-400)] hover:underline cursor-pointer'
                : 'text-[var(--color-text-primary)] cursor-default'
            }`}
          >
            {f.fileName}
          </button>
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono truncate">{f.sourceUrl || '—'}</div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (f) => <FileStatusBadge status={f.status} />,
    },
    {
      header: 'Review',
      className: 'whitespace-nowrap',
      accessor: (f) => (
        <div
          className="inline-flex items-center gap-1.5"
          title={f.approvedBy ? `Reviewed by ${f.approvedBy.name || f.approvedBy.username}` : undefined}
        >
          <FileApprovalBadge status={f.approvalStatus} />
          {f.approvedBy && (
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono truncate max-w-[80px]">
              @{f.approvedBy.username}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Size',
      accessor: (f) => <span className="font-mono text-xs">{formatBytes(f.fileSize)}</span>,
    },
    {
      header: 'SHA-256',
      accessor: (f) => (
        <span className="font-mono text-xs text-[var(--color-text-muted)] font-bold">
          {truncateSha256(f.sha256)}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right pr-3',
      accessor: (f) => (
        <div className="flex items-center justify-end gap-1">
          {canManage && (
            <>
              <button
                type="button"
                onClick={() =>
                  setApprovalTarget({
                    action: 'APPROVE',
                    scope: 'SINGLE',
                    fileId: f.id,
                  })
                }
                title="Approve File"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  f.approvalStatus === ApprovalStatus.APPROVED
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-[var(--color-text-muted)] hover:text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setApprovalTarget({
                    action: 'REJECT',
                    scope: 'SINGLE',
                    fileId: f.id,
                  })
                }
                title="Decline / Reject File"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  f.approvalStatus === ApprovalStatus.REJECTED
                    ? 'text-rose-400 bg-rose-500/10'
                    : 'text-[var(--color-text-muted)] hover:text-rose-400 hover:bg-rose-500/10'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {f.status === 'UPLOADED' && (
            <button
              type="button"
              onClick={() => handleDownload(f.id)}
              title="Download file"
              className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-brand-400)] hover:bg-[var(--color-bg-elevated)] transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/runs"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold font-mono text-[var(--color-text-primary)]">
              {run.runId}
            </h1>
            <RunStatusBadge status={run.status} />
            {!canManage && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                <Lock className="w-3 h-3" /> View Only
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">
            Source: {run.source?.name} | Collector: {run.collector?.name} | Launched by:{' '}
            <span className="text-[var(--color-text-secondary)] font-semibold">
              {(run as any).createdBy?.name || (run as any).createdBy?.username || 'Automated'}
            </span>
          </p>
        </div>

        {isRunning && canManage && (
          <div className="flex items-center gap-2">
            {run.status === RunStatus.PAUSED ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => resumeRun.mutate(run.id)}
                disabled={resumeRun.isPending}
                className="shadow-sm font-semibold border-emerald-500/30 text-emerald-400"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                Resume Run
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => pauseRun.mutate(run.id)}
                disabled={pauseRun.isPending || run.status === RunStatus.CANCEL_REQUESTED}
                className="shadow-sm font-semibold border-amber-500/30 text-amber-400"
              >
                <Pause className="w-4 h-4 text-amber-400" />
                Pause Run
              </Button>
            )}
            <Button
              variant="warning"
              size="sm"
              onClick={() => cancelRun.mutate(run.id)}
              disabled={cancelRun.isPending || run.status === RunStatus.CANCEL_REQUESTED}
              className="shadow-sm font-semibold"
            >
              <XCircle className="w-4 h-4 text-white" />
              {run.status === RunStatus.CANCEL_REQUESTED ? 'Cancelling...' : t('runs.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => forceCancelRun.mutate(run.id)}
              disabled={forceCancelRun.isPending}
              title="Immediately force status to CANCELLED and purge queue job"
              className="shadow-sm font-semibold"
            >
              <Zap className="w-4 h-4 text-white" />
              Force Stop
            </Button>
          </div>
        )}
      </div>

      {/* Result Folder Review & Sign-Off Bar */}
      {files.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                Folder Review
              </span>
              <span className="text-[11px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-base)] px-2 py-0.5 rounded-md border border-[var(--color-border-subtle)]">
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            <div className="h-3.5 w-px bg-[var(--color-border-subtle)] hidden sm:block" />

            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {approvedCount} accepted
              </span>
              <span className="inline-flex items-center gap-1.5 text-rose-400">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                {rejectedCount} declined
              </span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {pendingCount} pending
                </span>
              )}
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              {approvedCount === files.length ? (
                <button
                  type="button"
                  onClick={() =>
                    setApprovalTarget({
                      action: 'REJECT',
                      scope: 'ALL',
                    })
                  }
                  disabled={rejectAllInRun.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Decline Result Folder
                </button>
              ) : rejectedCount === files.length ? (
                <button
                  type="button"
                  onClick={() =>
                    setApprovalTarget({
                      action: 'APPROVE',
                      scope: 'ALL',
                    })
                  }
                  disabled={approveAllInRun.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Accept Result Folder
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setApprovalTarget({
                        action: 'APPROVE',
                        scope: 'ALL',
                      })
                    }
                    disabled={approveAllInRun.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Accept Folder
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setApprovalTarget({
                        action: 'REJECT',
                        scope: 'ALL',
                      })
                    }
                    disabled={rejectAllInRun.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Decline Folder
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {approvalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="relative w-full max-w-md bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              {approvalTarget.action === 'APPROVE' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {approvalTarget.action === 'APPROVE' ? 'Approve Files' : 'Decline Files'}
              </h2>
            </div>

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              {approvalTarget.scope === 'ALL'
                ? `${approvalTarget.action === 'APPROVE' ? 'Approve' : 'Decline'} all ${files.length} collected files in run ${run.runId}.`
                : approvalTarget.scope === 'BULK'
                ? `${approvalTarget.action === 'APPROVE' ? 'Approve' : 'Decline'} ${selectedFileIds.length} selected files.`
                : `${approvalTarget.action === 'APPROVE' ? 'Approve' : 'Decline'} the selected file.`}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Review Notes (Optional)</label>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="e.g. Verified PDF content and formatting..."
                rows={3}
                className="w-full text-xs p-3 rounded-lg bg-[var(--color-bg-overlay)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-400)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setApprovalTarget(null)}
                disabled={
                  approveFile.isPending ||
                  rejectFile.isPending ||
                  bulkApprove.isPending ||
                  bulkReject.isPending ||
                  approveAllInRun.isPending ||
                  rejectAllInRun.isPending
                }
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={approvalTarget.action === 'APPROVE' ? 'primary' : 'danger'}
                size="sm"
                onClick={handleConfirmApproval}
                disabled={
                  approveFile.isPending ||
                  rejectFile.isPending ||
                  bulkApprove.isPending ||
                  bulkReject.isPending ||
                  approveAllInRun.isPending ||
                  rejectAllInRun.isPending
                }
              >
                Confirm {approvalTarget.action === 'APPROVE' ? 'Approval' : 'Decline'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Why this run failed */}
      {run.status === RunStatus.FAILED && run.errors && run.errors.length > 0 && (
        <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-500)]/30 rounded-[var(--radius-lg)] p-4 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-[var(--color-error-400)] flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5 min-w-0">
            <div className="text-sm font-medium text-[var(--color-error-400)]">Why this run failed</div>
            {run.errors.map((err) => (
              <p key={err.id} className="text-xs text-[var(--color-text-secondary)] font-mono break-words">
                {err.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Real-time Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            {run.collector?.type === CollectorType.TELEGRAM ? 'Channels Scanned' : 'Pages Crawled'}
          </div>
          <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">{run.pagesCrawled.toLocaleString()}</div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Files Found</div>
          <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">{run.filesFound.toLocaleString()}</div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-success-400)] uppercase tracking-wider">Downloaded</div>
          <div className="text-xl font-bold font-mono text-[var(--color-success-400)] mt-1">
            {run.filesDownloaded.toLocaleString()}
          </div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-warning-400)] uppercase tracking-wider">Duplicates</div>
          <div className="text-xl font-bold font-mono text-[var(--color-warning-400)] mt-1">
            {run.filesDuplicate.toLocaleString()}
          </div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-error-400)] uppercase tracking-wider">Failed</div>
          <div className="text-xl font-bold font-mono text-[var(--color-error-400)] mt-1">
            {run.filesFailed.toLocaleString()}
          </div>
        </div>
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 shadow-xs">
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider">Duration</div>
          <div className="text-xl font-bold font-mono text-[var(--color-brand-400)] mt-1">
            <LiveDuration
              startedAt={run.startedAt}
              completedAt={run.completedAt}
              status={run.status}
              className="text-xl font-bold font-mono text-[var(--color-brand-400)]"
            />
          </div>
        </div>
      </div>

      {/* R2 Run folder reference */}
      <div className="text-xs font-mono flex flex-wrap items-center justify-between bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 shadow-xs gap-2">
        <span className="text-[var(--color-text-muted)] font-medium">R2 Raw Storage Location:</span>
        <span className="text-[var(--color-brand-400)] bg-[var(--color-bg-overlay)] px-2.5 py-1 rounded-md border border-[var(--color-border-subtle)] select-all font-semibold">
          00_raw/{run.collector?.type === CollectorType.TELEGRAM ? 'telegram' : 'web'}/{run.source?.slug}/{run.runId}/
        </span>
      </div>

      {/* Live Log Console Terminal */}
      <LogConsole run={run} />

      {/* Collected files in this run */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Files Collected in this Run
          </h2>

          {selectedFileIds.length > 0 && canManage && (
            <div className="flex items-center gap-2 bg-[var(--color-bg-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg shadow-sm">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                {selectedFileIds.length} file{selectedFileIds.length > 1 ? 's' : ''} selected:
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setApprovalTarget({
                    action: 'APPROVE',
                    scope: 'BULK',
                  })
                }
                disabled={bulkApprove.isPending}
                className="text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 font-semibold"
              >
                <Check className="w-3 h-3 mr-1" />
                Approve Selected
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setApprovalTarget({
                    action: 'REJECT',
                    scope: 'BULK',
                  })
                }
                disabled={bulkReject.isPending}
                className="text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10 font-semibold"
              >
                <X className="w-3 h-3 mr-1" />
                Decline Selected
              </Button>
              <button
                type="button"
                onClick={() => setSelectedFileIds([])}
                className="text-[11px] text-[var(--color-text-muted)] hover:underline ml-1 cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <DataTable
          columns={fileColumns}
          data={files}
          keyExtractor={(f) => f.id}
          isLoading={false}
          emptyMessage="No files discovered yet."
        />
      </div>
    </div>
  );
};
