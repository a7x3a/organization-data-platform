import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSources, useCreateSource, useDeleteSource } from '../hooks/useSources';
import { DataTable, Column } from '../components/DataTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Input';
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
          <div className="text-[var(--color-text-primary)]">{s.name}</div>
          <div className="text-xs text-[var(--color-text-muted)]">{s.slug}</div>
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
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand-400)] truncate max-w-xs"
        >
          {s.baseUrl}
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
      ),
    },
    {
      header: t('sources.fields.robotsPolicy'),
      accessor: (s) => (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {t(`sources.robotsPolicy.${s.robotsPolicy}`)}
        </span>
      ),
    },
    {
      header: t('sources.fields.enabled'),
      accessor: (s) => (
        <span
          className={`text-xs ${
            s.enabled ? 'text-[var(--color-success-400)]' : 'text-[var(--color-text-muted)]'
          }`}
        >
          {s.enabled ? t('common.enabled') : t('common.disabled')}
        </span>
      ),
    },
    {
      header: '',
      className: 'text-right',
      accessor: (s) => (
        <Button variant="danger" size="sm" iconOnly onClick={() => setSourceToDelete(s)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('sources.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('sources.subtitle')}</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4" />
          {t('sources.create')}
        </Button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-6 max-w-md w-full">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              {t('sources.create')}
            </h2>
            <form onSubmit={handleCreate} className="mt-5 space-y-5">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('sources.fields.name')}
                </label>
                <Input
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
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('sources.fields.slug')}
                </label>
                <Input
                  type="text"
                  required
                  pattern="^[a-z0-9\-]+$"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="kurdish-open-data"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('sources.fields.baseUrl')}
                </label>
                <Input
                  type="url"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('sources.fields.robotsPolicy')}
                </label>
                <Select
                  value={robotsPolicy}
                  onValueChange={(v) => setRobotsPolicy(v as 'RESPECT' | 'IGNORE')}
                  options={[
                    { value: 'RESPECT', label: 'Respect robots.txt' },
                    { value: 'IGNORE', label: 'Ignore robots.txt' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                  {t('sources.fields.description')}
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={createSource.isPending}>
                  {createSource.isPending ? t('common.loading') : t('common.create')}
                </Button>
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
