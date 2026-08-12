import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCollectors,
  useCreateCollector,
  useRunCollector,
  useEnableCollector,
  useDisableCollector,
} from '../hooks/useCollectors';
import { useSources } from '../hooks/useSources';
import { DataTable, Column } from '../components/DataTable';
import { Collector } from '@odp/shared-types';
import { Plus, Play, Power, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export const Collectors: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCollectors({ page, pageSize: 10 });
  const { data: sourcesData } = useSources({ page: 1, pageSize: 100 });

  const createCollector = useCreateCollector();
  const runCollector = useRunCollector();
  const enableCollector = useEnableCollector();
  const disableCollector = useDisableCollector();

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [sourceId, setSourceId] = useState('');
  const [name, setName] = useState('');
  const [startUrls, setStartUrls] = useState('');
  const [allowedDomains, setAllowedDomains] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);
  const [maxPages, setMaxPages] = useState(1000);
  const [concurrency, setConcurrency] = useState(4);
  const [useBrowser, setUseBrowser] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = startUrls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    const domains = allowedDomains
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    await createCollector.mutateAsync({
      sourceId,
      name,
      type: 'WEB',
      enabled: true,
      configuration: {
        startUrls: urls,
        allowedDomains: domains,
        allowedUrlPatterns: [],
        excludedUrlPatterns: [],
        allowedExtensions: [],
        allowedMimeTypes: [],
        maxDepth,
        maxPages,
        maxFiles: 10000,
        requestDelayMs: 1000,
        concurrency,
        requestTimeoutSeconds: 30,
        maxRetries: 3,
        useBrowser,
        robotsEnabled: true,
      },
    });
    setIsModalOpen(false);
  };

  const handleRun = async (id: string) => {
    const res = await runCollector.mutateAsync(id);
    navigate(`/runs/${res.collectionRunId}`);
  };

  const columns: Column<Collector>[] = [
    {
      header: t('collectors.fields.name'),
      accessor: (c) => (
        <div>
          <Link
            to={`/collectors/${c.id}`}
            className="font-semibold text-[var(--color-text-primary)] hover:underline"
          >
            {c.name}
          </Link>
          <div className="text-xs text-[var(--color-text-muted)] font-mono">
            {c.source?.name || '—'}
          </div>
        </div>
      ),
    },
    {
      header: t('collectors.fields.startUrls'),
      accessor: (c) => (
        <span className="font-mono text-xs text-[var(--color-brand-400)] truncate max-w-xs block">
          {c.configuration.startUrls?.[0] || '—'}
        </span>
      ),
    },
    {
      header: 'Limits',
      accessor: (c) => (
        <div className="text-xs font-mono text-[var(--color-text-muted)]">
          Depth: {c.configuration.maxDepth} | Conc: {c.configuration.concurrency}
          {c.configuration.useBrowser && (
            <span className="ml-1 px-1.5 py-0.5 bg-[var(--color-warning-bg)] text-[var(--color-warning-400)] rounded text-[10px]">
              Browser
            </span>
          )}
        </div>
      ),
    },
    {
      header: t('collectors.fields.enabled'),
      accessor: (c) => (
        <button
          onClick={() =>
            c.enabled ? disableCollector.mutate(c.id) : enableCollector.mutate(c.id)
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            c.enabled
              ? 'bg-[var(--color-success-bg)] text-[var(--color-success-400)] hover:bg-[var(--color-error-bg)] hover:text-[var(--color-error-400)]'
              : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:bg-[var(--color-success-bg)] hover:text-[var(--color-success-400)]'
          }`}
        >
          <Power className="w-3 h-3" />
          {c.enabled ? t('common.enabled') : t('common.disabled')}
        </button>
      ),
    },
    {
      header: t('common.actions'),
      accessor: (c) => (
        <button
          onClick={() => handleRun(c.id)}
          disabled={!c.enabled || runCollector.isPending}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--color-brand-600)] text-white text-xs font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-brand-500)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {t('collectors.run')}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t('collectors.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('collectors.subtitle')}</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-brand-500)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('collectors.create')}
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data || []}
        keyExtractor={(c) => c.id}
        isLoading={isLoading}
        emptyMessage="No web collectors created yet."
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

      {/* Create Collector Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 max-w-xl w-full shadow-[var(--shadow-elevated)] max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              {t('collectors.create')}
            </h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('collectors.fields.source')}
                </label>
                <select
                  required
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                >
                  <option value="">Select source website...</option>
                  {sourcesData?.data.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('collectors.fields.name')}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily PDF Books Scraper"
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('collectors.fields.startUrls')} (one per line)
                </label>
                <textarea
                  required
                  rows={3}
                  value={startUrls}
                  onChange={(e) => setStartUrls(e.target.value)}
                  placeholder="https://example.com/books&#10;https://example.com/archive"
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-mono text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('collectors.fields.allowedDomains')} (comma separated)
                </label>
                <input
                  type="text"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  placeholder="example.com, archive.example.com"
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-mono text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Max Depth
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-mono text-[var(--color-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Max Pages
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-mono text-[var(--color-text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Concurrency
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-mono text-[var(--color-text-primary)]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="useBrowser"
                  checked={useBrowser}
                  onChange={(e) => setUseBrowser(e.target.checked)}
                  className="rounded border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-brand-600)]"
                />
                <label htmlFor="useBrowser" className="text-xs font-medium text-[var(--color-text-primary)]">
                  Use Playwright Headless Browser (for JS-rendered pages)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-medium text-[var(--color-text-secondary)]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createCollector.isPending}
                  className="px-4 py-2 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-brand-500)] disabled:opacity-50"
                >
                  {createCollector.isPending ? t('common.loading') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
