import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRun, useCancelRun, usePauseRun, useResumeRun, useForceCancelRun } from '../hooks/useRuns';
import { useFiles } from '../hooks/useFiles';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { DataTable, Column } from '../components/DataTable';
import { Button } from '../components/Button';
import { ArrowLeft, XCircle, AlertTriangle, Zap, Pause, Play } from 'lucide-react';
import { CollectedFile, CollectorType, RunStatus } from '@odp/shared-types';
import { formatBytes, formatDuration, truncateSha256 } from '../lib/utils';
import { LiveDuration } from '../components/LiveDuration';
import { LogConsole } from '../components/LogConsole';

export const RunDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { data: run, isLoading } = useRun(id!);
  const isRunning =
    run ? (run.status === RunStatus.RUNNING || run.status === RunStatus.PENDING || run.status === RunStatus.PAUSED || run.status === RunStatus.CANCEL_REQUESTED) : false;

  const { data: filesData } = useFiles(
    { collectionRunId: id!, pageSize: 20 },
    { refetchInterval: isRunning ? 2000 : false }
  );
  const cancelRun = useCancelRun();
  const pauseRun = usePauseRun();
  const resumeRun = useResumeRun();
  const forceCancelRun = useForceCancelRun();

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

  const fileColumns: Column<CollectedFile>[] = [
    {
      header: 'File ID',
      accessor: (f) => <span className="font-mono text-xs text-[var(--color-brand-400)]">{f.fileId}</span>,
    },
    {
      header: 'File Name',
      accessor: (f) => (
        <div className="truncate max-w-xs" title={f.fileName}>
          <div className="font-medium text-xs text-[var(--color-text-primary)] truncate">{f.fileName}</div>
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono truncate">{f.sourceUrl}</div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (f) => <FileStatusBadge status={f.status} />,
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
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">
            Source: {run.source?.name} | Collector: {run.collector?.name} | Version: {run.collectorVersion}
          </p>
        </div>

        {isRunning && (
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

      {/* Why this run failed — without this, a FAILED run with 0 everywhere
          gives no way to tell "Telegram isn't configured yet" apart from
          "the collector's start URLs are wrong" apart from any other cause. */}
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
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Files Collected in this Run
        </h2>
        <DataTable
          columns={fileColumns}
          data={filesData?.data || []}
          keyExtractor={(f) => f.id}
          isLoading={false}
          emptyMessage="No files discovered yet."
        />
      </div>
    </div>
  );
};
