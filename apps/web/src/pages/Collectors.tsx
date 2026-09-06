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
import { CollectorTypeInput } from '../types/forms';
import {
  Plus,
  Play,
  Power,
  Send,
  Pencil,
  Trash2,
  Globe,
  X,
  Database,
  BookOpen,
  FileText,
  Video,
  Image,
  Archive,
  Sparkles,
  CheckCircle2,
  Bot,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

type CollectorPresetType = 'articles' | 'books' | 'documents' | 'datasets' | 'video' | 'images' | 'archives' | 'all';

const COLLECTOR_PRESETS: {
  id: CollectorPresetType;
  label: string;
  description: string;
  icon: React.ElementType;
  extensions: string[];
}[] = [
  {
    id: 'articles',
    label: 'Web Articles & Text Knowledge',
    description: 'Extract full page text, article bodies, headings & JSON dataset records',
    icon: Globe,
    extensions: ['.html', '.json'],
  },
  {
    id: 'books',
    label: 'Books & Ebooks',
    description: 'PDF books, EPUB ebooks, MOBI, and AZW3 documents',
    icon: BookOpen,
    extensions: ['.pdf', '.epub', '.mobi', '.azw3', '.fb2', '.djvu'],
  },
  {
    id: 'documents',
    label: 'Office Documents',
    description: 'Word DOCX, PDF reports, ODT, and office text files',
    icon: FileText,
    extensions: ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md', '.pages'],
  },
  {
    id: 'datasets',
    label: 'Data & Knowledge',
    description: 'Parquet, JSONL, CSV, TSV, and XML datasets',
    icon: Database,
    extensions: ['.parquet', '.jsonl', '.csv', '.tsv', '.json', '.xml', '.arrow'],
  },
  {
    id: 'video',
    label: 'Video & Footage',
    description: 'MP4, MKV, WebM, and high definition video files',
    icon: Video,
    extensions: ['.mp4', '.mkv', '.avi', '.mov', '.webm'],
  },
  {
    id: 'images',
    label: 'Images & Photos',
    description: 'JPG, PNG, WebP, SVG, and high resolution scans',
    icon: Image,
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'],
  },
  {
    id: 'archives',
    label: 'Archives & Bundles',
    description: 'ZIP, RAR, 7Z, and compressed package archives',
    icon: Archive,
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
  },
  {
    id: 'all',
    label: 'All Media & Files',
    description: 'Discover all supported media, documents and web text formats',
    icon: Sparkles,
    extensions: [],
  },
];

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
  const [selectedPresets, setSelectedPresets] = useState<CollectorPresetType[]>(['books']);

  const togglePreset = (id: CollectorPresetType) => {
    if (id === 'all') {
      if (selectedPresets.includes('all')) {
        setSelectedPresets(['books']);
      } else {
        setSelectedPresets(['all']);
      }
      return;
    }
    setSelectedPresets((prev) => {
      const withoutAll = prev.filter((p) => p !== 'all');
      if (withoutAll.includes(id)) {
        const filtered = withoutAll.filter((p) => p !== id);
        return filtered.length > 0 ? filtered : ['all'];
      } else {
        return [...withoutAll, id];
      }
    });
  };

  // TELEGRAM fields
  const [channels, setChannels] = useState('');
  const [messageLimit, setMessageLimit] = useState(500);
  const [downloadMedia, setDownloadMedia] = useState(true);
  const ALL_MEDIA_TYPES = ['photo', 'video', 'document'] as const;
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
    setSelectedPresets(['books']);
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
        setSelectedPresets(['all']);
      } else {
        const matched = COLLECTOR_PRESETS.filter(
          (p) => p.id !== 'all' && p.extensions.some((ext) => allowedExts.includes(ext))
        ).map((p) => p.id);
        setSelectedPresets(matched.length > 0 ? matched : ['all']);
      }
    } else if (isWebCollector(collector)) {
      setCollectorType('WEB');
      setStartUrls(collector.configuration.startUrls.join('\n'));
      setAllowedDomains(collector.configuration.allowedDomains.join(', '));
      setMaxDepth(collector.configuration.maxDepth);
      setMaxPages(collector.configuration.maxPages);
      setConcurrency(collector.configuration.concurrency);
      const allowedExts = collector.configuration.allowedExtensions || [];
      if (allowedExts.length === 0 && !collector.configuration.extractWebData) {
        setSelectedPresets(['all']);
      } else {
        const matched = COLLECTOR_PRESETS.filter(
          (p) => p.id !== 'all' && (
            (p.id === 'articles' && collector.configuration.extractWebData) ||
            p.extensions.some((ext) => allowedExts.includes(ext))
          )
        ).map((p) => p.id);
        setSelectedPresets(matched.length > 0 ? matched : ['all']);
      }
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

    const isAll = selectedPresets.includes('all');
    const extensions = isAll
      ? []
      : Array.from(
          new Set(
            COLLECTOR_PRESETS.filter((p) => selectedPresets.includes(p.id)).flatMap(
              (p) => p.extensions
            )
          )
        );

    if (collectorType === 'TELEGRAM') {
      const channelList = channels
        .split(/[\n,]+/)
        .map((c) => c.trim().replace(/^@/, ''))
        .filter(Boolean);

      const existingTelegramConfig =
        editingCollector && isTelegramCollector(editingCollector)
          ? editingCollector.configuration
          : undefined;

      const effectiveMediaTypes = [...mediaTypes];
      if (!isAll && extensions.length > 0 && !effectiveMediaTypes.includes('document')) {
        effectiveMediaTypes.push('document');
      }

      const telegramConfig = {
        ...existingTelegramConfig,
        channels: channelList,
        messageLimit,
        downloadMedia: downloadMedia && effectiveMediaTypes.length > 0,
        includeMediaTypes: effectiveMediaTypes as Array<'photo' | 'video' | 'document'>,
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

    const urls = startUrls
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const domains = allowedDomains
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    // Preserve fields this simplified form doesn't expose (allowedUrlPatterns,
    // excludedUrlPatterns, allowedMimeTypes, maxFiles, requestDelayMs,
    // requestTimeoutSeconds, maxRetries, robotsEnabled) rather than silently
    // resetting them to hardcoded defaults every time an existing collector
    // is edited — a user who'd customized maxFiles to 500 shouldn't find it
    // quietly back at 10000 after renaming their collector.
    const existingWebConfig =
      editingCollector && isWebCollector(editingCollector) ? editingCollector.configuration : undefined;

    const isWebArticles = selectedPresets.includes('articles') || selectedPresets.includes('all');

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
      useBrowser: true,
      extractWebData: isWebArticles,
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

      {/* Create / Edit Collector Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-elevated)] overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                    {editingCollector ? `Edit "${editingCollector.name}"` : t('collectors.create')}
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Configure data extraction targets, presets & autonomous engines
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-md)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
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
                      className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${collectorType === 'WEB'
                        ? 'border-[var(--color-brand-500)] text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-bg-base)] hover:border-[var(--color-border-strong)]'
                        }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Web Collector
                    </button>
                    <button
                      type="button"
                      disabled={!!editingCollector}
                      onClick={() => setCollectorType('TELEGRAM')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${collectorType === 'TELEGRAM'
                        ? 'border-[var(--color-brand-500)] text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-bg-base)] hover:border-[var(--color-border-strong)]'
                        }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      Telegram Collector
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
                        Public channel usernames, without the @. Uses your authenticated personal Telegram session.
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
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={downloadMedia}
                            onChange={(e) => setDownloadMedia(e.target.checked)}
                            className="rounded border-[var(--color-border)] bg-transparent text-[var(--color-brand-600)]"
                          />
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            Download media attachments
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
                              <label key={type} className="flex items-center gap-2 cursor-pointer">
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

                        {/* Presets Cards Grid */}
                        <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                              Select File Categories / Presets <span className="text-[var(--color-text-muted)] font-normal">(Multi-Select)</span>
                            </label>
                            <span className="text-[11px] font-mono text-[var(--color-brand-400)] font-medium">
                              {selectedPresets.includes('all') ? 'All Formats (No Filter)' : `${selectedPresets.length} selected`}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {COLLECTOR_PRESETS.map((preset) => {
                              const Icon = preset.icon;
                              const isSelected = selectedPresets.includes(preset.id);
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => togglePreset(preset.id)}
                                  className={`flex items-start gap-3 p-3 text-left rounded-xl border transition-colors cursor-pointer ${isSelected
                                      ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-text-primary)] font-medium'
                                      : 'border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'
                                    }`}
                                >
                                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-[var(--color-brand-400)]' : ''}`} />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate flex items-center justify-between">
                                      <span>{preset.label}</span>
                                      <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                        isSelected
                                          ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)] text-white'
                                          : 'border-[var(--color-border)] bg-transparent'
                                      }`}>
                                        {isSelected && <CheckCircle2 className="w-3 h-3" />}
                                      </div>
                                    </div>
                                    <div className="text-[11px] text-[var(--color-text-muted)] leading-tight mt-0.5 line-clamp-2">
                                      {preset.description}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
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

                    {/* Presets Cards Grid for Web Collector */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                          Select File Categories / Presets <span className="text-[var(--color-text-muted)] font-normal">(Multi-Select)</span>
                        </label>
                        <span className="text-[11px] font-mono text-[var(--color-brand-400)] font-medium">
                          {selectedPresets.includes('all') ? 'All Formats (No Filter)' : `${selectedPresets.length} selected`}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {COLLECTOR_PRESETS.map((preset) => {
                          const Icon = preset.icon;
                          const isSelected = selectedPresets.includes(preset.id);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => togglePreset(preset.id)}
                              className={`flex items-start gap-3 p-3 text-left rounded-xl border transition-colors cursor-pointer ${isSelected
                                  ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-text-primary)] font-medium'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'
                                }`}
                            >
                              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-[var(--color-brand-400)]' : ''}`} />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium truncate flex items-center justify-between">
                                  <span>{preset.label}</span>
                                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                    isSelected
                                      ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)] text-white'
                                      : 'border-[var(--color-border)] bg-transparent'
                                  }`}>
                                    {isSelected && <CheckCircle2 className="w-3 h-3" />}
                                  </div>
                                </div>
                                <div className="text-[11px] text-[var(--color-text-muted)] leading-tight mt-0.5 line-clamp-2">
                                  {preset.description}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
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

              </div>

              {/* Footer Actions */}
              <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={createCollector.isPending || updateCollector.isPending}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={createCollector.isPending || updateCollector.isPending || !sourceId || !name}>
                  {editingCollector ? 'Save Changes' : 'Create Collector'}
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
