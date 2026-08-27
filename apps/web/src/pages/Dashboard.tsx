import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardStats } from '../hooks/useSources';
import { useCancelRun, usePauseRun, useResumeRun, useForceCancelRun } from '../hooks/useRuns';
import { DataTable, Column } from '../components/DataTable';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { Button } from '../components/Button';
import {
  Bot,
  Zap,
  Layers,
  Database,
  XCircle,
  ArrowUpRight,
  Pause,
  Play,
} from 'lucide-react';
import { CollectionRun, RunStatus } from '@odp/shared-types';
import { formatDuration } from '../lib/utils';
import { LiveDuration } from '../components/LiveDuration';
import { Link } from 'react-router-dom';
import { QuickCollectModal } from '../components/QuickCollectModal';

const ACTIVE_STATUSES = new Set([RunStatus.PENDING, RunStatus.RUNNING, RunStatus.PAUSED, 'CANCEL_REQUESTED']);

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useDashboardStats();
  const cancelRun = useCancelRun();
  const pauseRun = usePauseRun();
  const resumeRun = useResumeRun();
  const forceCancelRun = useForceCancelRun();
  const [isQuickCollectOpen, setIsQuickCollectOpen] = React.useState(false);

  const columns: Column<CollectionRun>[] = [
    {
      header: t('runs.fields.runId'),
      accessor: (run) => (
        <Link
          to={`/runs/${run.id}`}
          className="font-mono text-xs text-[var(--color-brand-400)] hover:underline font-bold"
        >
          {run.runId}
        </Link>
      ),
    },
    {
      header: t('runs.fields.source'),
      accessor: (run) => (
        <span className="font-medium text-xs text-[var(--color-text-primary)]">
          {run.source?.name || '—'}
        </span>
      ),
    },
    {
      header: t('runs.fields.collector'),
      accessor: (run) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-[var(--color-bg-overlay)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]">
          <Bot className="w-3.5 h-3.5 text-[var(--color-brand-400)]" />
          {run.collector?.name || '—'}
        </span>
      ),
    },
    {
      header: t('runs.fields.status'),
      accessor: (run) => <RunStatusBadge status={run.status} />,
    },
    {
      header: t('runs.fields.filesDownloaded'),
      accessor: (run) => (
        <span className="font-mono text-xs font-bold text-[var(--color-text-primary)]">
          {run.filesDownloaded.toLocaleString()}
        </span>
      ),
    },
    {
      header: t('runs.fields.duration'),
      accessor: (run) => (
        <LiveDuration
          startedAt={run.startedAt}
          completedAt={run.completedAt}
          status={run.status}
        />
      ),
    },
    {
      header: t('common.actions'),
      accessor: (run) =>
        ACTIVE_STATUSES.has(run.status) ? (
          <div className="flex items-center gap-1.5">
            {run.status === 'PAUSED' ? (
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                title="Resume Run"
                onClick={() => resumeRun.mutate(run.id)}
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
                onClick={() => pauseRun.mutate(run.id)}
                disabled={pauseRun.isPending || run.status === 'CANCEL_REQUESTED'}
              >
                <Pause className="w-3.5 h-3.5 text-amber-400" />
              </Button>
            )}
            <Button
              variant="warning"
              size="sm"
              iconOnly
              title={run.status === 'CANCEL_REQUESTED' ? 'Cancelling...' : 'Cancel Run'}
              onClick={() => cancelRun.mutate(run.id)}
              disabled={cancelRun.isPending || run.status === 'CANCEL_REQUESTED'}
            >
              <XCircle className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="danger"
              size="sm"
              iconOnly
              title="Force Stop & Purge Queue Job"
              onClick={() => forceCancelRun.mutate(run.id)}
              disabled={forceCancelRun.isPending}
            >
              <Zap className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Link
            to={`/runs/${run.id}`}
            className="text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Details
          </Link>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <QuickCollectModal
        isOpen={isQuickCollectOpen}
        onClose={() => setIsQuickCollectOpen(false)}
      />

      {/* Modern Bento Grid Layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* Bento Hero Tile: Total Artifacts & Storage Breakdown (Col 8) */}
        <div className="col-span-12 lg:col-span-8 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="text-xs font-bold font-mono text-[var(--color-brand-400)] uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4" />
              Raw Artifact Storage Engine
            </div>
            <div className="text-3xl font-bold font-mono text-[var(--color-text-primary)] mt-2">
              {isLoading ? '...' : (stats?.totalFilesCollected?.toLocaleString() ?? 0)}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Total deduplicated raw files stored in 00_raw storage zone across all active sources
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-[var(--color-border-subtle)]">
            <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg p-3">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Web Zone</div>
              <div className="text-xs font-bold font-mono text-[var(--color-text-primary)] mt-0.5">00_raw/web/</div>
            </div>
            <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg p-3">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Telegram Zone</div>
              <div className="text-xs font-bold font-mono text-[var(--color-text-primary)] mt-0.5">00_raw/telegram/</div>
            </div>
            <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg p-3">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Media Zone</div>
              <div className="text-xs font-bold font-mono text-[var(--color-text-primary)] mt-0.5">00_raw/media/</div>
            </div>
          </div>
        </div>

        {/* Bento Tile 2: Active Sources & Collectors (Col 4) */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-4 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase font-mono tracking-wider">
              Sources & Collectors
            </span>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <div className="text-2xl font-bold font-mono text-[var(--color-text-primary)]">
                  {isLoading ? '...' : (stats?.totalSources ?? 0)}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)]">Enabled Sources</div>
              </div>
              <div>
                <div className="text-2xl font-bold font-mono text-[var(--color-text-primary)]">
                  {isLoading ? '...' : (stats?.activeCollectors ?? 0)}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)]">Active Collectors</div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-xs font-mono text-[var(--color-text-muted)]">
            <Link to="/sources" className="hover:text-[var(--color-brand-400)]">Manage Sources →</Link>
            <Link to="/collectors" className="hover:text-[var(--color-brand-400)]">Manage Collectors →</Link>
          </div>
        </div>

        {/* Bento Tile 3: Queue & Active Job Status (Col 12) */}
        <div className="col-span-12 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase font-mono tracking-wider">
              Queue & Active Executions
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="p-3 bg-[var(--color-bg-base)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-xl font-bold font-mono text-amber-500">
                  {isLoading ? '...' : (stats?.runningRuns ?? 0)}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">Active Collection Runs</div>
              </div>
              <div className="p-3 bg-[var(--color-bg-base)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-xl font-bold font-mono text-[var(--color-warning-400)]">
                  {isLoading ? '...' : (stats?.totalDuplicates?.toLocaleString() ?? 0)}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">Duplicates Filtered</div>
              </div>
              <div className="p-3 bg-[var(--color-bg-base)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-xl font-bold font-mono text-[var(--color-error-400)]">
                  {isLoading ? '...' : (stats?.totalFailedFiles?.toLocaleString() ?? 0)}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">Failed Files</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Executions Table Card */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--color-brand-400)]" />
            <h2 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider font-mono">
              {t('dashboard.recentRuns')}
            </h2>
          </div>
          <Link
            to="/runs"
            className="flex items-center gap-1 text-xs font-mono font-medium text-[var(--color-brand-400)] hover:underline"
          >
            View All Executions
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <DataTable
          columns={columns}
          data={stats?.recentRuns || []}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No collection runs executed yet."
        />
      </div>
    </div>
  );
};
