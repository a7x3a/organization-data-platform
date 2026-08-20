import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCollectors,
  useCreateCollector,
  useUpdateCollector,
  useDeleteCollector,
  useRunCollector,
  useEnableCollector,
  useDisableCollector,
} from '../hooks/useCollectors';
import { useSources } from '../hooks/useSources';
import { DataTable, Column } from '../components/DataTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Input';
import { Collector, isTelegramCollector, isWebCollector } from '@odp/shared-types';
import { CollectorTypeInput, STANDARDIZED_FILE_GROUPS } from '../types/forms';
import { Plus, Play, Power, Send, Pencil, Trash2, Globe, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const FILE_TYPE_CATEGORIES: { label: string; extensions: string[] }[] = STANDARDIZED_FILE_GROUPS.map((g) => ({
  label: g.name,
  extensions: g.extensions,
}));

export const Collectors: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useCollectors({ page, pageSize: 10 });
  const { data: sourcesData } = useSources({ page: 1, pageSize: 100 });

  const createCollector = useCreateCollector();
  const updateCollector = useUpdateCollector();
  const deleteCollector = useDeleteCollector();
  const runCollector = useRunCollector();
  const enableCollector = useEnableCollector();
  const disableCollector = useDisableCollector();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [collectorToDelete, setCollectorToDelete] = useState<Collector | null>(null);
  // null = creating a new collector; set = editing this existing one.
  // Source and type are fixed once a collector exists (the API's
  // updateCollectorSchema omits sourceId entirely, and switching collector
  // type would require a completely different configuration shape) — both
  // are shown read-only in edit mode rather than left silently ineffective.
  const [editingCollector, setEditingCollector] = useState<Collector | null>(null);

  // Form state
  const [collectorType, setCollectorType] = useState<CollectorTypeInput>('WEB');
  const [sourceId, setSourceId] = useState('');
  const [name, setName] = useState('');
  // WEB fields
  const [startUrls, setStartUrls] = useState('');
  const [allowedDomains, setAllowedDomains] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);
  const [maxPages, setMaxPages] = useState(1000);
  const [concurrency, setConcurrency] = useState(4);
  const [useBrowser, setUseBrowser] = useState(false);
  // Off by default — discover every file type the crawler finds, matching
  // the scraper's own "discover everything unless narrowed" default
  // (empty allowedExtensions means no filter, not "nothing allowed").
  const [restrictFileTypes, setRestrictFileTypes] = useState(false);
  const [fileTypeCategories, setFileTypeCategories] = useState<string[]>([]);

  const toggleFileTypeCategory = (label: string) => {
    setFileTypeCategories((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]
    );
  };
  // TELEGRAM fields
  const [channels, setChannels] = useState('');
  const [messageLimit, setMessageLimit] = useState(500);
  const [downloadMedia, setDownloadMedia] = useState(true);
  // All four checked by default — an empty includeMediaTypes list means
  // "no filter" to the scraper, so "everything checked" and "list omitted"
  // are equivalent; sending the explicit list here just keeps the UI's
  // checked state and what's actually submitted in sync at a glance.
  const ALL_MEDIA_TYPES = ['photo', 'video', 'audio', 'document'] as const;
  const [mediaTypes, setMediaTypes] = useState<string[]>([...ALL_MEDIA_TYPES]);

  const toggleMediaType = (type: string) => {
    setMediaTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const resetForm = () => {
    setEditingCollector(null);
    setCollectorType('WEB');
    setSourceId('');
    setName('');
    setStartUrls('');
    setAllowedDomains('');
    setMaxDepth(5);
    setMaxPages(1000);
    setConcurrency(4);
    setUseBrowser(false);
    setRestrictFileTypes(false);
    setFileTypeCategories([]);
    setChannels('');
    setMessageLimit(500);
    setDownloadMedia(true);
    setMediaTypes([...ALL_MEDIA_TYPES]);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (collector: Collector) => {
    setEditingCollector(collector);
    setName(collector.name);
    setSourceId(collector.sourceId);

    if (isTelegramCollector(collector)) {
      setCollectorType('TELEGRAM');
      setChannels(collector.configuration.channels.join('\n'));
      setMessageLimit(collector.configuration.messageLimit);
      setDownloadMedia(collector.configuration.downloadMedia);
      const incMedia = collector.configuration.includeMediaTypes || [];
      setMediaTypes(
        incMedia.length > 0
          ? incMedia
          : [...ALL_MEDIA_TYPES]
      );
      let allowedExts = (collector.configuration as any).allowedExtensions || [];
      if (allowedExts.length === 0) {
        const lowerName = collector.name.toLowerCase();
        if (lowerName.includes('book') || lowerName.includes('ebook')) {
          allowedExts = ['.pdf', '.epub', '.mobi', '.azw3', '.fb2', '.djvu'];
        } else if (lowerName.includes('research') || lowerName.includes('document')) {
          allowedExts = ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md'];
        } else if (lowerName.includes('audio')) {
          allowedExts = ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac'];
        } else if (lowerName.includes('data') || lowerName.includes('dataset')) {
          allowedExts = ['.parquet', '.jsonl', '.csv', '.tsv', '.json', '.xml'];
        }
      }
      const restricted = allowedExts.length > 0;
      setRestrictFileTypes(restricted);
      setFileTypeCategories(
        restricted
          ? FILE_TYPE_CATEGORIES.filter((cat) =>
              cat.extensions.some((ext) => allowedExts.includes(ext))
            ).map((cat) => cat.label)
          : []
      );
    } else if (isWebCollector(collector)) {
      setCollectorType('WEB');
      setStartUrls(collector.configuration.startUrls.join('\n'));
      setAllowedDomains(collector.configuration.allowedDomains.join(', '));
      setMaxDepth(collector.configuration.maxDepth);
      setMaxPages(collector.configuration.maxPages);
      setConcurrency(collector.configuration.concurrency);
      setUseBrowser(collector.configuration.useBrowser);
      const restricted = collector.configuration.allowedExtensions.length > 0;
      setRestrictFileTypes(restricted);
      setFileTypeCategories(
        restricted
          ? FILE_TYPE_CATEGORIES.filter((cat) =>
            cat.extensions.some((ext) => collector.configuration.allowedExtensions.includes(ext))
          ).map((cat) => cat.label)
          : []
      );
    }

    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId) return;

    if (collectorType === 'TELEGRAM') {
      const channelList = channels
        .split(/[\n,]+/)
        .map((c) => c.trim().replace(/^@/, ''))
        .filter(Boolean);

      const existingTelegramConfig =
        editingCollector && isTelegramCollector(editingCollector)
          ? editingCollector.configuration
          : undefined;

      const extensions =
        restrictFileTypes && fileTypeCategories.length > 0
          ? FILE_TYPE_CATEGORIES.filter((c) => fileTypeCategories.includes(c.label)).flatMap(
            (c) => c.extensions
          )
          : [];

      const effectiveMediaTypes = [...mediaTypes];
      if (restrictFileTypes && fileTypeCategories.length > 0) {
        const hasDocCategory = fileTypeCategories.some((cat) =>
          ['Documents', 'Spreadsheets', 'Presentations', 'Ebooks', 'Archives', 'Text & Data'].includes(cat)
        );
        if (hasDocCategory && !effectiveMediaTypes.includes('document')) {
          effectiveMediaTypes.push('document');
        }
      }

      const telegramConfig = {
        ...existingTelegramConfig,
        channels: channelList,
        messageLimit,
        downloadMedia: downloadMedia && effectiveMediaTypes.length > 0,
        includeMediaTypes: effectiveMediaTypes as Array<'photo' | 'video' | 'audio' | 'document'>,
        allowedExtensions: extensions,
      };

      if (editingCollector) {
        await updateCollector.mutateAsync({
          id: editingCollector.id,
          data: { name, type: 'TELEGRAM', configuration: telegramConfig },
        });
      } else {
        await createCollector.mutateAsync({
          sourceId,
          name,
          type: 'TELEGRAM',
          enabled: true,
          configuration: telegramConfig,
        });
      }
      closeModal();
      return;
    }

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
    // Not restricting, or restricting with nothing checked (a no-op form
    // state), both mean the same thing to the scraper: [] = no filter,
    // discover every file type. Only a genuine category selection narrows it.
    const extensions =
      restrictFileTypes && fileTypeCategories.length > 0
        ? FILE_TYPE_CATEGORIES.filter((c) => fileTypeCategories.includes(c.label)).flatMap(
          (c) => c.extensions
        )
        : [];

    // Preserve fields this simplified form doesn't expose (allowedUrlPatterns,
    // excludedUrlPatterns, allowedMimeTypes, maxFiles, requestDelayMs,
    // requestTimeoutSeconds, maxRetries, robotsEnabled) rather than silently
    // resetting them to hardcoded defaults every time an existing collector
    // is edited — a user who'd customized maxFiles to 500 shouldn't find it
    // quietly back at 10000 after renaming their collector.
    const existingWebConfig =
      editingCollector && isWebCollector(editingCollector) ? editingCollector.configuration : undefined;

    const webConfig = {
      allowedUrlPatterns: [],
      excludedUrlPatterns: [],
      allowedMimeTypes: [],
      maxFiles: 10000,
      requestDelayMs: 1000,
      requestTimeoutSeconds: 30,
      maxRetries: 3,
      robotsEnabled: true,
      ...existingWebConfig,
      startUrls: urls,
      allowedDomains: domains,
      allowedExtensions: extensions,
      maxDepth,
      maxPages,
      concurrency,
      useBrowser,
    };

    if (editingCollector) {
      await updateCollector.mutateAsync({
        id: editingCollector.id,
        data: { name, type: 'WEB', configuration: webConfig },
      });
    } else {
      await createCollector.mutateAsync({
        sourceId,
        name,
        type: 'WEB',
        enabled: true,
        configuration: webConfig,
      });
    }
    closeModal();
  };

  const handleRun = async (id: string) => {
    const res = await runCollector.mutateAsync(id);
    navigate(`/runs/${res.collectionRunId}`);
  };

  const handleDeleteConfirmed = async () => {
    if (!collectorToDelete) return;
    await deleteCollector.mutateAsync(collectorToDelete.id);
    setCollectorToDelete(null);
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
      header: 'Source',
      accessor: (c) => {
        if (isTelegramCollector(c)) {
          return (
            <span className="text-xs text-[var(--color-text-muted)] truncate max-w-xs block">
              @{c.configuration.channels?.[0] || '—'}
            </span>
          );
        }
        if (isWebCollector(c)) {
          return (
            <span className="text-xs text-[var(--color-text-muted)] truncate max-w-xs block">
              {c.configuration.startUrls?.[0] || '—'}
            </span>
          );
        }
        return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
      },
    },
    {
      header: 'Limits',
      accessor: (c) => {
        if (isTelegramCollector(c)) {
          return (
            <div className="text-xs text-[var(--color-text-muted)]">
              {c.configuration.messageLimit} messages
              {c.configuration.downloadMedia && <span className="ml-1.5">· Media</span>}
            </div>
          );
        }
        if (isWebCollector(c)) {
          return (
            <div className="text-xs text-[var(--color-text-muted)]">
              Depth {c.configuration.maxDepth} · Conc {c.configuration.concurrency}
              {c.configuration.useBrowser && <span className="ml-1.5">· Browser</span>}
            </div>
          );
        }
        return <div className="text-xs text-[var(--color-text-muted)]">—</div>;
      },
    },
    {
      header: t('collectors.fields.enabled'),
      accessor: (c) => (
        <button
          onClick={() =>
            c.enabled ? disableCollector.mutate(c.id) : enableCollector.mutate(c.id)
          }
          className={`inline-flex items-center gap-1.5 text-xs transition-colors ${c.enabled
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
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" iconOnly onClick={() => openEditModal(c)} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="danger"
            size="sm"
            iconOnly
            onClick={() => setCollectorToDelete(c)}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleRun(c.id)}
            disabled={!c.enabled || runCollector.isPending}
          >
            <Play className="w-3.5 h-3.5" />
            {t('collectors.run')}
          </Button>
        </div>
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
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4" />
          {t('collectors.create')}
        </Button>
      </div>

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)]">
        <DataTable
          columns={columns}
          data={data?.data || []}
          keyExtractor={(c) => c.id}
          isLoading={isLoading}
          emptyMessage="No collectors created yet."
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

      {/* Create Collector Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-2xl overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {editingCollector ? `Edit "${editingCollector.name}"` : t('collectors.create')}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                    Collector Type
                    {editingCollector && (
                      <span className="ml-1.5 text-[var(--color-text-muted)] font-normal normal-case">
                        (fixed once created)
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!!editingCollector}
                      onClick={() => setCollectorType('WEB')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded-[var(--radius-md)] border transition-colors disabled:opacity-50 disabled:pointer-events-none ${collectorType === 'WEB'
                        ? 'border-[var(--color-brand-500)] text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                        }`}
                    >
                      Web
                    </button>
                    <button
                      type="button"
                      disabled={!!editingCollector}
                      onClick={() => setCollectorType('TELEGRAM')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded-[var(--radius-md)] border transition-colors disabled:opacity-50 disabled:pointer-events-none ${collectorType === 'TELEGRAM'
                        ? 'border-[var(--color-brand-500)] text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                        }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      Telegram
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                    {t('collectors.fields.source')}
                    {editingCollector && (
                      <span className="ml-1.5 text-[var(--color-text-muted)] font-normal normal-case">
                        (fixed once created)
                      </span>
                    )}
                  </label>
                  <Select
                    value={sourceId}
                    onValueChange={setSourceId}
                    disabled={!!editingCollector}
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
                    placeholder={
                      collectorType === 'TELEGRAM'
                        ? 'e.g. News Channel Archive'
                        : 'e.g. Daily PDF Books Scraper'
                    }
                  />
                </div>

                {collectorType === 'TELEGRAM' ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                        Channels (one per line or comma separated)
                      </label>
                      <Textarea
                        required
                        rows={3}
                        value={channels}
                        onChange={(e) => setChannels(e.target.value)}
                        placeholder="my_channel&#10;another_channel"
                      />
                      <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                        Public channel usernames, without the @. Requires the scraper
                        worker's Telegram account to be logged in (see README) and to
                        have access to each channel.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                          Message Limit (per channel, per run)
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={100000}
                          value={messageLimit}
                          onChange={(e) => setMessageLimit(Number(e.target.value))}
                        />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={downloadMedia}
                            onChange={(e) => setDownloadMedia(e.target.checked)}
                            className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-brand-600)]"
                          />
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            Download media
                          </span>
                        </label>
                      </div>
                    </div>

                    {downloadMedia && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                            Telegram Media Kinds
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {ALL_MEDIA_TYPES.map((type) => (
                              <label key={type} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={mediaTypes.includes(type)}
                                  onChange={() => toggleMediaType(type)}
                                  className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-brand-600)]"
                                />
                                <span className="text-xs text-[var(--color-text-secondary)] capitalize">
                                  {type === 'document' ? 'Documents (Files)' : `${type}s`}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={restrictFileTypes}
                              onChange={(e) => setRestrictFileTypes(e.target.checked)}
                              className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-brand-600)]"
                            />
                            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                              Restrict to specific file categories (PDF, Ebooks, Docs, etc.)
                            </span>
                          </label>
                          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                            Off by default — collects every file attachment. Select a preset or check boxes below to restrict file types.
                          </p>

                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setRestrictFileTypes(true);
                                setFileTypeCategories(['PDF Documents', 'E-Books & Publications']);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                                restrictFileTypes &&
                                fileTypeCategories.includes('PDF Documents') &&
                                fileTypeCategories.includes('E-Books & Publications')
                                  ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'
                              }`}
                            >
                              📚 Books & Ebooks Preset
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRestrictFileTypes(true);
                                setFileTypeCategories(['PDF Documents', 'Office Documents']);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                                restrictFileTypes &&
                                fileTypeCategories.includes('PDF Documents') &&
                                fileTypeCategories.includes('Office Documents')
                                  ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'
                              }`}
                            >
                              📄 Research Docs Preset
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRestrictFileTypes(true);
                                setFileTypeCategories(['Audio Files']);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                                restrictFileTypes &&
                                fileTypeCategories.includes('Audio Files') &&
                                fileTypeCategories.length === 1
                                  ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'
                              }`}
                            >
                              🎧 Audiobooks Preset
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRestrictFileTypes(true);
                                setFileTypeCategories(['Data & Datasets']);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                                restrictFileTypes &&
                                fileTypeCategories.includes('Data & Datasets') &&
                                fileTypeCategories.length === 1
                                  ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]'
                              }`}
                            >
                              📊 Datasets Preset
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRestrictFileTypes(false);
                                setFileTypeCategories([]);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                                !restrictFileTypes
                                  ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]'
                              }`}
                            >
                              🌐 All Files (No Filter)
                            </button>
                          </div>

                          {restrictFileTypes && (
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {FILE_TYPE_CATEGORIES.map((category) => (
                                <label key={category.label} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={fileTypeCategories.includes(category.label)}
                                    onChange={() => toggleFileTypeCategory(category.label)}
                                    className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-brand-600)]"
                                  />
                                  <span className="text-xs text-[var(--color-text-secondary)]">
                                    {category.label}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}

                          {restrictFileTypes && fileTypeCategories.length === 0 && (
                            <p className="mt-1.5 text-[11px] text-[var(--color-warning-400)]">
                              No file categories selected — with none checked, all file extensions will be collected.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
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

                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={restrictFileTypes}
                          onChange={(e) => setRestrictFileTypes(e.target.checked)}
                          className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-brand-600)]"
                        />
                        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                          Restrict to specific file types
                        </span>
                      </label>
                      <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                        Off by default — the crawler discovers every file type it finds (PDFs,
                        images, audio, video, archives, and more), not just a fixed list.
                      </p>

                      {restrictFileTypes && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {FILE_TYPE_CATEGORIES.map((category) => (
                            <label key={category.label} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={fileTypeCategories.includes(category.label)}
                                onChange={() => toggleFileTypeCategory(category.label)}
                                className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-brand-600)]"
                              />
                              <span className="text-xs text-[var(--color-text-secondary)]">
                                {category.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}

                      {restrictFileTypes && fileTypeCategories.length === 0 && (
                        <p className="mt-1.5 text-[11px] text-[var(--color-warning-400)]">
                          No file types selected — with none checked, this has no effect and every
                          file type will still be discovered.
                        </p>
                      )}
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
                  </>
                )}

                {collectorType === 'WEB' && (
                  <div
                    onClick={() => setUseBrowser(!useBrowser)}
                    className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none mt-2 ${useBrowser
                      ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 shadow-sm text-[var(--color-text-primary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-base)] hover:border-[var(--color-border-strong)] text-[var(--color-text-secondary)]'
                      }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${useBrowser ? 'bg-[var(--color-brand-500)] text-white' : 'bg-[var(--color-bg-overlay)] text-[var(--color-brand-400)]'
                        }`}>
                        <Globe className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <span>Autonomous Engine Selection</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]">
                            Auto HTTP + Playwright
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                          {useBrowser
                            ? 'Forced Playwright Chromium active for all URLs.'
                            : 'Automatic: Fast HTTP by default, switches to Playwright Chromium on JS SPAs & Cloudflare.'}
                        </p>
                      </div>
                    </div>

                    <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${useBrowser ? 'bg-[var(--color-brand-500)]' : 'bg-[var(--color-border-strong)]'
                      }`}>
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${useBrowser ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                    </div>
                  </div>
                )}
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                <Button type="button" variant="ghost" onClick={closeModal}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={createCollector.isPending || updateCollector.isPending || !sourceId}
                >
                  {createCollector.isPending || updateCollector.isPending
                    ? t('common.loading')
                    : editingCollector
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
        isOpen={!!collectorToDelete}
        title="Delete Collector"
        message={
          collectorToDelete
            ? `Delete "${collectorToDelete.name}"? This cannot be undone. Collectors with existing collection runs can't be deleted — disable them instead.`
            : ''
        }
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setCollectorToDelete(null)}
        isLoading={deleteCollector.isPending}
      />
    </div>
  );
};
