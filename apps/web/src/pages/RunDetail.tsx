import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRun, useCancelRun } from '../hooks/useRuns';
import { useFiles } from '../hooks/useFiles';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { DataTable, Column } from '../components/DataTable';
import { Button } from '../components/Button';
import { ArrowLeft, XCircle } from 'lucide-react';
import { CollectedFile, RunStatus } from '@odp/shared-types';
import { formatBytes, formatDuration, truncateSha256 } from '../lib/utils';

export const RunDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const { data: run, isLoading } = useRun(id!);
  const { data: filesData } = useFiles({ collectionRunId: id!, pageSize: 20 });
  const cancelRun = useCancelRun();

  if (isLoading || !run) {
    return <div className="p-8 text-center text-[var(--color-text-muted)]">Loading run progress...</div>;
  }

  const isRunning = run.status === RunStatus.RUNNING || run.status === RunStatus.PENDING;

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
          <Button variant="danger" onClick={() => cancelRun.mutate(run.id)} disabled={cancelRun.isPending}>
            <XCircle className="w-4 h-4" />
            {t('runs.cancel')}
          </Button>
        )}
      </div>

      {/* Real-time Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
        <div>
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Pages Crawled</div>
          <div className="text-lg font-semibold font-mono mt-1">{run.pagesCrawled.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Files Found</div>
          <div className="text-lg font-semibold font-mono mt-1">{run.filesFound.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-[var(--color-success-400)] uppercase">Downloaded</div>
          <div className="text-lg font-semibold font-mono text-[var(--color-success-400)] mt-1">
            {run.filesDownloaded.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-[var(--color-warning-400)] uppercase">Duplicates</div>
          <div className="text-lg font-semibold font-mono text-[var(--color-warning-400)] mt-1">
            {run.filesDuplicate.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-[var(--color-error-400)] uppercase">Failed</div>
          <div className="text-lg font-semibold font-mono text-[var(--color-error-400)] mt-1">
            {run.filesFailed.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Duration</div>
          <div className="text-lg font-semibold font-mono text-[var(--color-brand-400)] mt-1">
            {formatDuration(run.startedAt, run.completedAt)}
          </div>
        </div>
      </div>

      {/* R2 Run folder reference */}
      <div className="text-xs font-mono flex items-center justify-between border-t border-b border-[var(--color-border)] py-3">
        <span className="text-[var(--color-text-muted)]">R2 Raw Storage Location:</span>
        <span className="text-[var(--color-brand-400)]">
          00_raw/web/{run.source?.slug}/{run.runId}/
        </span>
      </div>

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
