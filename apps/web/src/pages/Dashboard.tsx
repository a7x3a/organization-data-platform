import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardStats } from '../hooks/useSources';
import { StatsCard } from '../components/StatsCard';
import { DataTable, Column } from '../components/DataTable';
import { RunStatusBadge } from '../components/RunStatusBadge';
import { Globe, Bot, Play, FileCheck, Copy, AlertTriangle } from 'lucide-react';
import { CollectionRun } from '@odp/shared-types';
import { formatDuration } from '../lib/utils';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useDashboardStats();

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
      header: t('runs.fields.source'),
      accessor: (run) => run.source?.name || '—',
    },
    {
      header: t('runs.fields.collector'),
      accessor: (run) => run.collector?.name || '—',
    },
    {
      header: t('runs.fields.status'),
      accessor: (run) => <RunStatusBadge status={run.status} />,
    },
    {
      header: t('runs.fields.filesDownloaded'),
      accessor: (run) => (
        <span className="font-mono">{run.filesDownloaded.toLocaleString()}</span>
      ),
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
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          {t('dashboard.title')}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t('dashboard.subtitle')}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatsCard
          title={t('dashboard.stats.totalSources')}
          value={isLoading ? '...' : stats?.totalSources ?? 0}
          icon={<Globe className="w-4 h-4" />}
          variant="info"
        />
        <StatsCard
          title={t('dashboard.stats.activeCollectors')}
          value={isLoading ? '...' : stats?.activeCollectors ?? 0}
          icon={<Bot className="w-4 h-4" />}
          variant="default"
        />
        <StatsCard
          title={t('dashboard.stats.runningRuns')}
          value={isLoading ? '...' : stats?.runningRuns ?? 0}
          icon={<Play className="w-4 h-4" />}
          variant="info"
        />
        <StatsCard
          title={t('dashboard.stats.filesCollected')}
          value={isLoading ? '...' : stats?.totalFilesCollected?.toLocaleString() ?? 0}
          icon={<FileCheck className="w-4 h-4" />}
          variant="success"
        />
        <StatsCard
          title={t('dashboard.stats.duplicates')}
          value={isLoading ? '...' : stats?.totalDuplicates?.toLocaleString() ?? 0}
          icon={<Copy className="w-4 h-4" />}
          variant="warning"
        />
        <StatsCard
          title={t('dashboard.stats.failedFiles')}
          value={isLoading ? '...' : stats?.totalFailedFiles?.toLocaleString() ?? 0}
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="error"
        />
      </div>

      {/* Recent Runs Section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {t('dashboard.recentRuns')}
        </h2>
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
