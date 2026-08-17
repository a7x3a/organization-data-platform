import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSources, useCreateSource, useUpdateSource, useDeleteSource } from '../hooks/useSources';
import { DataTable, Column } from '../components/DataTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Input';
import { Source } from '@odp/shared-types';
import { Plus, Pencil, Trash2, ExternalLink, Globe } from 'lucide-react';

export const Sources: React.FC = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSources({ page, pageSize: 10 });
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<Source | null>(null);
  const [editingSource, setEditingSource] = useState<Source | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [description, setDescription] = useState('');
  const [robotsPolicy, setRobotsPolicy] = useState<'RESPECT' | 'IGNORE'>('RESPECT');

  const resetForm = () => {
    setEditingSource(null);
    setName('');
    setSlug('');
    setBaseUrl('');
    setDescription('');
    setRobotsPolicy('RESPECT');
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (source: Source) => {
    setEditingSource(source);
    setName(source.name);
    setSlug(source.slug);
    setBaseUrl(source.baseUrl);
    setDescription(source.description || '');
    setRobotsPolicy(source.robotsPolicy);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSource) {
      await updateSource.mutateAsync({
        id: editingSource.id,
        data: { name, baseUrl, description, robotsPolicy },
      });
    } else {
      await createSource.mutateAsync({
        name,
        slug,
        baseUrl,
        description,
        enabled: true,
        robotsPolicy,
      });
    }
    closeModal();
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
          <div className="font-semibold text-xs text-[var(--color-text-primary)]">{s.name}</div>
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">{s.slug}</div>
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
          className="inline-flex items-center gap-1 text-xs text-[var(--color-brand-400)] hover:underline font-mono truncate max-w-xs"
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
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[11px] font-mono ${
            s.enabled
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
              : 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
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
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" iconOnly onClick={() => openEditModal(s)} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="danger" size="sm" iconOnly onClick={() => setSourceToDelete(s)} title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex items-center justify-between bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-sm p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xs bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] flex items-center justify-center shrink-0 border border-[var(--color-brand-500)]/20">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
              {t('sources.title')}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)]">{t('sources.subtitle')}</p>
          </div>
        </div>
        <Button onClick={openCreateModal} className="bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)]">
          <Plus className="w-4 h-4" />
          {t('sources.create')}
        </Button>
      </div>

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-sm p-4">
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
      </div>

      {/* Create Source Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-sm p-5 max-w-md w-full shadow-lg">
            <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-[var(--color-text-primary)]">
              {editingSource ? `Edit "${editingSource.name}"` : t('sources.create')}
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                  {t('sources.fields.name')}
                </label>
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!editingSource && !slug) {
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '')
                      );
                    }
                  }}
                  placeholder="e.g. Open Books Archive"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                  {t('sources.fields.slug')}
                  {editingSource && (
                    <span className="ml-1 text-[var(--color-text-muted)] font-normal">
                      (fixed)
                    </span>
                  )}
                </label>
                <Input
                  type="text"
                  required
                  disabled={!!editingSource}
                  pattern="^[a-z0-9\-]+$"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="open-books-archive"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
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
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
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
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                  {t('sources.fields.description')}
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={closeModal}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={createSource.isPending || updateSource.isPending}>
                  {createSource.isPending || updateSource.isPending
                    ? t('common.loading')
                    : editingSource
                    ? 'Save Changes'
                    : t('common.create')}
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
