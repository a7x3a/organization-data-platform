import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSources, useCreateSource, useUpdateSource, useDeleteSource } from '../hooks/useSources';
import { useAuth } from '../hooks/useAuth';
import { collectorsApi } from '../api/collectors';
import { runsApi } from '../api/runs';
import { filesApi } from '../api/files';
import { DataTable, Column } from '../components/DataTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Input';
import { Source } from '@odp/shared-types';
import { printSourceReportDocument, SourceReportData } from '../lib/generateSourceDoc';
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Globe,
  ShieldCheck,
  X,
  Printer,
  RefreshCw,
} from 'lucide-react';

export const Sources: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSources({ page, pageSize: 10 });
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<Source | null>(null);
  const [editingSource, setEditingSource] = useState<Source | null>(null);

  const [isPrintingAll, setIsPrintingAll] = useState(false);
  const [printingSourceId, setPrintingSourceId] = useState<string | null>(null);

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

  // Direct 1-Click Print for All Platform Sources
  const handlePrintAllSources = async () => {
    setIsPrintingAll(true);
    try {
      const allSourcesList = data?.data || [];
      const [collectorsRes, runsRes, filesRes] = await Promise.all([
        collectorsApi.list({ pageSize: 100 }),
        runsApi.list({ pageSize: 100 }),
        filesApi.list({ pageSize: 100 }),
      ]);

      const sourcesToReport: SourceReportData[] = allSourcesList.map((s) => ({
        source: s,
        collectors: (collectorsRes?.data || []).filter((c) => c.sourceId === s.id),
        runs: (runsRes?.data || []).filter((r) => r.sourceId === s.id),
        files: (filesRes?.data || []).filter((f) => f.sourceId === s.id),
      }));

      printSourceReportDocument({
        title: 'Enterprise Sources & Data Ingestion Dossier',
        reportCode: 'QAI-AUD-ALL',
        sourcesData: sourcesToReport,
        isCombined: true,
        userName: user?.name || user?.username || 'Administrator',
      });
    } catch (err) {
      console.error('Failed to prepare print dossier:', err);
    } finally {
      setIsPrintingAll(false);
    }
  };

  // Direct 1-Click Print for Single Target Source
  const handlePrintSingleSource = async (source: Source) => {
    setPrintingSourceId(source.id);
    try {
      const [collectorsRes, runsRes, filesRes] = await Promise.all([
        collectorsApi.list({ sourceId: source.id, pageSize: 100 }),
        runsApi.list({ sourceId: source.id, pageSize: 100 }),
        filesApi.list({ sourceId: source.id, pageSize: 100 }),
      ]);

      printSourceReportDocument({
        title: `Audit Report — ${source.name}`,
        reportCode: `QAI-AUD-SRC-${source.slug.toUpperCase()}`,
        sourcesData: [
          {
            source,
            collectors: collectorsRes?.data || [],
            runs: runsRes?.data || [],
            files: filesRes?.data || [],
          },
        ],
        isCombined: false,
        userName: user?.name || user?.username || 'Administrator',
      });
    } catch (err) {
      console.error('Failed to print source report:', err);
    } finally {
      setPrintingSourceId(null);
    }
  };

  const columns: Column<Source>[] = [
    {
      header: t('sources.fields.name'),
      accessor: (s) => (
        <div>
          <a
            href={s.baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-xs text-[var(--color-text-primary)] hover:text-[var(--color-brand-400)] hover:underline inline-flex items-center gap-1"
          >
            {s.name}
            <ExternalLink className="w-3 h-3 text-[var(--color-text-muted)]" />
          </a>
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
      header: t('sources.fields.description'),
      accessor: (s) => (
        <span className="text-xs text-[var(--color-text-muted)] truncate max-w-xs block">
          {s.description || 'Auto-created source'}
        </span>
      ),
    },
    {
      header: t('sources.fields.robotsPolicy'),
      accessor: (s) => (
        <span
          title="Respect robots.txt: Crawls honor website rules and disallow paths defined by the target site. Missing or 404 robots.txt files automatically permit full access."
          className="inline-flex items-center gap-1 text-xs font-mono text-[var(--color-text-secondary)] cursor-help"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          {t(`sources.robotsPolicy.${s.robotsPolicy}`)}
        </span>
      ),
    },
    {
      header: '',
      className: 'text-right',
      accessor: (s) => (
        <div className="flex justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            iconOnly
            onClick={() => handlePrintSingleSource(s)}
            disabled={printingSourceId === s.id}
            title="Instant Print A4 Official Dossier"
          >
            <Printer className={`w-3.5 h-3.5 text-[var(--color-brand-400)] ${printingSourceId === s.id ? 'animate-spin' : ''}`} />
          </Button>
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
    <div className="space-y-6">
      {/* Clean Page Header matching Collectors page */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {t('sources.title')}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{t('sources.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {data && data.data.length > 0 && (
            <Button
              variant="secondary"
              onClick={handlePrintAllSources}
              disabled={isPrintingAll}
              className="text-xs font-semibold text-[var(--color-brand-400)] border-[var(--color-brand-500)]/30 hover:bg-[var(--color-brand-500)]/10"
              title="Instant Direct Print Official A4 Dossier for All Targets"
            >
              {isPrintingAll ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin text-[var(--color-brand-400)]" />
              ) : (
                <Printer className="w-3.5 h-3.5 mr-1.5 text-[var(--color-brand-400)]" />
              )}
              <span>{isPrintingAll ? 'Preparing A4 Dossier...' : 'Print All Status Dossier'}</span>
            </Button>
          )}
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4" />
            {t('sources.create')}
          </Button>
        </div>
      </div>

      {/* Single Table Card matching Collectors page */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)]">
        <DataTable
          columns={columns}
          data={data?.data || []}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No sources created yet."
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

      {/* Create / Edit Source Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-2xl)] shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-[var(--color-text-primary)]">
                  {editingSource ? `Edit "${editingSource.name}"` : t('sources.create')}
                </h2>
              </div>
              <button onClick={closeModal} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                      { value: 'RESPECT', label: 'Respect robots.txt (Recommended)' },
                      { value: 'IGNORE', label: 'Ignore robots.txt' },
                    ]}
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    Respect robots.txt: Crawling honors website rules. If robots.txt is missing or 404, full access is granted by default.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                    {t('sources.fields.description')}
                  </label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional description of this data source..."
                  />
                </div>
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
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
