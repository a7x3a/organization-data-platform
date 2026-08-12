import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCollector, useRunCollector } from '../hooks/useCollectors';
import { useRuns } from '../hooks/useRuns';
import { DataTable, Column } from '../components/DataTable';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { Play, ArrowLeft, Bot, Globe } from 'lucide-react';
import { CollectionRun } from '@odp/shared-types';
import { formatDuration } from '../lib/utils';

export const CollectorDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: collector, isLoading } = useCollector(id!);
  const { data: runsData } = useRuns({ collectorId: id!, pageSize: 20 });
  const runCollector = useRunCollector();

  if (isLoading || !collector) {
    return <div className="p-8 text-center text-[var(--color-text-muted)]">Loading collector details...</div>;
  }

  const handleRun = async () => {
    const res = await runCollector.mutateAsync(collector.id);
    navigate(`/runs/${res.collectionRunId}`);
  };

  const columns: Column<CollectionRun>[] = [
    {
      header: t('runs.fields.runId'),
      accessor: (run) => (
        <Link
          to={`/runs/${run.id}`}
          className="font-mono text-xs text-[var(--color-brand-400)] hover:underline"
        >
          {run.runId}
        </Link>
      ),
    },
    {
      header: t('runs.fields.status'),
      accessor: (run) => <RunStatusBadge status={run.status} />,
    },
    {
      header: t('runs.fields.filesDownloaded'),
      accessor: (run) => <span className="font-mono">{run.filesDownloaded}</span>,
    },
    {
      header: t('runs.fields.filesDuplicate'),
      accessor: (run) => <span className="font-mono text-[var(--color-warning-400)]">{run.filesDuplicate}</span>,
    },
    {
      header: t('runs.fields.filesFailed'),
      accessor: (run) => <span className="font-mono text-[var(--color-error-400)]">{run.filesFailed}</span>,
    },
    {
      header: t('runs.fields.duration'),
      accessor: (run) => (
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {formatDuration(run.startedAt, run.completedAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/collectors"
          className="p-2 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <Bot className="w-6 h-6 text-[var(--color-brand-400)]" />
            {collector.name}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] flex items-center gap-1 mt-0.5">
            <Globe className="w-3.5 h-3.5" /> Source: {collector.source?.name} ({collector.source?.slug})
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={!collector.enabled || runCollector.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-brand-500)] disabled:opacity-40 transition-colors"
        >
          <Play className="w-4 h-4" />
          {t('collectors.run')}
        </button>
      </div>

      {/* Config Details */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
        <div>
          <span className="text-[var(--color-text-muted)] block">Start URLs</span>
          <span className="text-[var(--color-brand-400)] truncate block">
            {collector.configuration.startUrls?.join(', ') || '—'}
          </span>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)] block">Max Depth / Pages</span>
          <span className="text-[var(--color-text-primary)]">
            {collector.configuration.maxDepth} levels / {collector.configuration.maxPages} pages
          </span>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)] block">Concurrency / Delay</span>
          <span className="text-[var(--color-text-primary)]">
            {collector.configuration.concurrency} workers / {collector.configuration.requestDelayMs}ms delay
          </span>
        </div>
        <div>
          <span className="text-[var(--color-text-muted)] block">Engine</span>
          <span className="text-[var(--color-text-primary)]">
            {collector.configuration.useBrowser ? 'Playwright Chromium' : 'HTTP Spider'}
          </span>
        </div>
      </div>

      {/* Collection Runs for this collector */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Run History ({runsData?.total || 0})
        </h2>
        <DataTable
          columns={columns}
          data={runsData?.data || []}
          keyExtractor={(r) => r.id}
          isLoading={false}
          emptyMessage="No runs executed for this collector yet."
        />
      </div>
    </div>
  );
};
