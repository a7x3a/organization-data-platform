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
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Input';
import { Collector } from '@odp/shared-types';
import { Plus, Play, Power } from 'lucide-react';
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
    if (!sourceId) return;
    // Accept commas as well as newlines — "Allowed Domains" right below
    // this field is comma-separated, so a user typing all URLs on one
    // line separated by commas (an easy, natural mistake) previously
    // produced a single malformed URL instead of being split apart.
    const urls = startUrls
      .split(/[\n,]+/)
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
          <Link to={`/collectors/${c.id}`} className="text-[var(--color-text-primary)] hover:underline">
            {c.name}
          </Link>
          <div className="text-xs text-[var(--color-text-muted)]">{c.source?.name || '—'}</div>
        </div>
      ),
    },
    {
      header: t('collectors.fields.startUrls'),
      accessor: (c) => (
        <span className="text-xs text-[var(--color-text-muted)] truncate max-w-xs block">
          {c.configuration.startUrls?.[0] || '—'}
        </span>
      ),
    },
    {
      header: 'Limits',
      accessor: (c) => (
        <div className="text-xs text-[var(--color-text-muted)]">
          Depth {c.configuration.maxDepth} · Conc {c.configuration.concurrency}
          {c.configuration.useBrowser && <span className="ml-1.5">· Browser</span>}
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
          className={`inline-flex items-center gap-1.5 text-xs transition-colors ${
            c.enabled
              ? 'text-[var(--color-success-400)] hover:text-[var(--color-error-400)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-success-400)]'
          }`}
        >
          <Power className="w-3 h-3" />
          {c.enabled ? t('common.enabled') : t('common.disabled')}
        </button>
      ),
    },
    {
      header: '',
      className: 'text-right',
      accessor: (c) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleRun(c.id)}
          disabled={!c.enabled || runCollector.isPending}
        >
          <Play className="w-3.5 h-3.5" />
          {t('collectors.run')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('collectors.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('collectors.subtitle')}</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4" />
          {t('collectors.create')}
        </Button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {t('collectors.create')}
            </h2>
            <form onSubmit={handleCreate} className="mt-5 space-y-5">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('collectors.fields.source')}
                </label>
                <Select
                  value={sourceId}
                  onValueChange={setSourceId}
                  placeholder="Select source website..."
                  options={(sourcesData?.data || []).map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.slug})`,
                  }))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('collectors.fields.name')}
                </label>
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily PDF Books Scraper"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('collectors.fields.startUrls')} (one per line)
                </label>
                <Textarea
                  required
                  rows={3}
                  value={startUrls}
                  onChange={(e) => setStartUrls(e.target.value)}
                  placeholder="https://example.com/books&#10;https://example.com/archive"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('collectors.fields.allowedDomains')} (comma separated)
                </label>
                <Input
                  type="text"
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  placeholder="example.com, archive.example.com"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                    Max Depth
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                    Max Pages
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={100000}
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                    Concurrency
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={16}
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={useBrowser}
                  onChange={(e) => setUseBrowser(e.target.checked)}
                  className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-brand-600)]"
                />
                <span className="text-xs text-[var(--color-text-secondary)]">
                  Use Playwright headless browser (for JS-rendered pages)
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border)]">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={createCollector.isPending || !sourceId}>
                  {createCollector.isPending ? t('common.loading') : t('common.create')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
