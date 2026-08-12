import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSources, useCreateSource, useDeleteSource } from '../hooks/useSources';
import { DataTable, Column } from '../components/DataTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Source } from '@odp/shared-types';
import { Plus, Trash2, ExternalLink } from 'lucide-react';

export const Sources: React.FC = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSources({ page, pageSize: 10 });
  const createSource = useCreateSource();
  const deleteSource = useDeleteSource();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<Source | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [description, setDescription] = useState('');
  const [robotsPolicy, setRobotsPolicy] = useState<'RESPECT' | 'IGNORE'>('RESPECT');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSource.mutateAsync({
      name,
      slug,
      baseUrl,
      description,
      enabled: true,
      robotsPolicy,
    });
    setIsModalOpen(false);
    setName('');
    setSlug('');
    setBaseUrl('');
    setDescription('');
  };

  const handleDelete = async () => {
    if (!sourceToDelete) return;
    await deleteSource.mutateAsync(sourceToDelete.id);
    setSourceToDelete(null);
  };

  const columns: Column<Source>[] = [
    {
      header: t('sources.fields.name'),
      accessor: (s) => (
        <div>
          <div className="font-semibold text-[var(--color-text-primary)]">{s.name}</div>
          <div className="text-xs font-mono text-[var(--color-text-muted)]">{s.slug}</div>
        </div>
      ),
    },
    {
      header: t('sources.fields.baseUrl'),
      accessor: (s) => (
        <a
          href={s.baseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs text-[var(--color-brand-400)] hover:underline truncate max-w-xs"
        >
          {s.baseUrl}
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
      ),
    },
    {
      header: t('sources.fields.robotsPolicy'),
      accessor: (s) => (
        <span className="text-xs font-mono text-[var(--color-text-secondary)]">
          {t(`sources.robotsPolicy.${s.robotsPolicy}`)}
        </span>
      ),
    },
    {
      header: t('sources.fields.enabled'),
      accessor: (s) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            s.enabled
              ? 'bg-[var(--color-success-bg)] text-[var(--color-success-400)]'
              : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]'
          }`}
        >
          {s.enabled ? t('common.enabled') : t('common.disabled')}
        </span>
      ),
    },
    {
      header: t('common.actions'),
      accessor: (s) => (
        <button
          onClick={() => setSourceToDelete(s)}
          className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-error-400)] hover:bg-[var(--color-bg-elevated)] transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t('sources.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('sources.subtitle')}</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:bg-[var(--color-brand-500)] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('sources.create')}
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data || []}
        keyExtractor={(s) => s.id}
        isLoading={isLoading}
        emptyMessage="No sources configured yet."
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

      {/* Create Source Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-6 max-w-lg w-full shadow-[var(--shadow-elevated)]">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              {t('sources.create')}
            </h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('sources.fields.name')}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) {
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '')
                      );
                    }
                  }}
                  placeholder="e.g. Kurdish Open Data"
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('sources.fields.slug')}
                </label>
                <input
                  type="text"
                  required
                  pattern="^[a-z0-9\-]+$"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="kurdish-open-data"
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-mono text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('sources.fields.baseUrl')}
                </label>
                <input
                  type="url"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-mono text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('sources.fields.robotsPolicy')}
                </label>
                <select
                  value={robotsPolicy}
                  onChange={(e) => setRobotsPolicy(e.target.value as 'RESPECT' | 'IGNORE')}
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                >
                  <option value="RESPECT">Respect robots.txt</option>
                  <option value="IGNORE">Ignore robots.txt</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  {t('sources.fields.description')}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-primary)] focus:border-[var(--color-brand-500)] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)] transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createSource.isPending}
                  className="px-4 py-2 bg-[var(--color-brand-600)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:bg-[var(--color-brand-500)] transition-colors disabled:opacity-50"
                >
                  {createSource.isPending ? t('common.loading') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={!!sourceToDelete}
        title={t('sources.delete')}
        message={t('sources.deleteConfirm')}
        onConfirm={handleDelete}
        onCancel={() => setSourceToDelete(null)}
        isLoading={deleteSource.isPending}
      />
    </div>
  );
};
