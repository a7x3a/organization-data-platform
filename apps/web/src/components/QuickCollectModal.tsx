import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useCreateSource, useSources } from '../hooks/useSources';
import { useCreateCollector, useRunCollector } from '../hooks/useCollectors';
import { Button } from './Button';
import { Input } from './Input';
import { Zap, BookOpen, FileText, Database, X, Sparkles, CheckCircle2, Send, Globe, Monitor, Video, Image, Archive, AlertCircle } from 'lucide-react';
import { RobotsPolicy } from '@odp/shared-types';
import { TelegramSetupModal } from './TelegramSetupModal';

interface QuickCollectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PresetType = 'articles' | 'books' | 'documents' | 'datasets' | 'video' | 'images' | 'archives' | 'all';

const PRESETS: { id: PresetType; label: string; description: string; icon: React.ElementType; extensions: string[] }[] = [
  {
    id: 'articles',
    label: 'Web Articles & Text Knowledge',
    description: 'Extract full page text, article bodies, headings & JSON dataset records',
    icon: Globe,
    extensions: ['.html', '.json'],
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

export const QuickCollectModal: React.FC<QuickCollectModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { data: sourcesData } = useSources({ page: 1, pageSize: 100 });
  const createSource = useCreateSource();
  const createCollector = useCreateCollector();
  const runCollector = useRunCollector();

  const [url, setUrl] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [selectedPresets, setSelectedPresets] = useState<PresetType[]>(['books']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ is_authorized: boolean } | null>(null);

  const togglePreset = (id: PresetType) => {
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
        return filtered.length > 0 ? filtered : ['books'];
      } else {
        return [...withoutAll, id];
      }
    });
  };

  useEffect(() => {
    if (isOpen) {
      apiClient.get('/telegram/status')
        .then((r: any) => setTelegramStatus(r.data))
        .catch(() => setTelegramStatus({ is_authorized: false }));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const detectTelegramTarget = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return { isTelegram: false };
    if (trimmed.startsWith('@')) {
      return { isTelegram: true, channelUsername: trimmed.slice(1) };
    }
    if (trimmed.includes('t.me/') || trimmed.includes('telegram.me/') || trimmed.includes('telegram.org/')) {
      try {
        const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        let username = parts[0];
        if (username === 's' && parts[1]) {
          username = parts[1];
        }
        if (username && !['joinchat', 'c', 'share'].includes(username)) {
          return { isTelegram: true, channelUsername: username };
        }
        return { isTelegram: true, channelUsername: username || 'telegram_channel' };
      } catch {
        return { isTelegram: true, channelUsername: trimmed.replace(/[^a-zA-Z0-9_]/g, '') };
      }
    }
    return { isTelegram: false };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!url.trim()) {
      setError('Please enter a target URL or Telegram channel');
      return;
    }

    const tgTarget = detectTelegramTarget(url);
    const isAll = selectedPresets.includes('all');
    const effectiveExtensions = isAll
      ? []
      : Array.from(
          new Set(
            PRESETS.filter((p) => selectedPresets.includes(p.id)).flatMap((p) => p.extensions)
          )
        );

    const tgMediaTypes: Array<'photo' | 'video' | 'document'> = isAll
      ? ['photo', 'video', 'document']
      : Array.from(
          new Set(
            selectedPresets.flatMap((p) => {
              if (p === 'video') return ['video', 'document'];
              if (p === 'images') return ['photo', 'document'];
              return ['document'];
            }) as Array<'photo' | 'video' | 'document'>
          )
        );

    const presetNames = isAll
      ? 'All Media'
      : PRESETS.filter((p) => selectedPresets.includes(p.id))
          .map((p) => p.label.split(' ')[0])
          .join(' + ');

    setIsSubmitting(true);
    try {
      if (tgTarget.isTelegram) {
        const channel = tgTarget.channelUsername || 'channel';
        const slug = `telegram-${channel.toLowerCase().replace(/[^a-z0-9-_]/g, '-')}`;

        // Check auth status
        if (telegramStatus && !telegramStatus.is_authorized) {
          setError('Telegram scraper is not logged in yet. Opening setup modal...');
          setShowTelegramSetup(true);
          setIsSubmitting(false);
          return;
        }

        // 1. Find or create Source for Telegram
        let sourceId = sourcesData?.data?.find((s) => s.slug === slug || s.baseUrl.includes(channel))?.id;
        if (!sourceId) {
          try {
            const newSource = await createSource.mutateAsync({
              name: collectionName.trim() ? `Telegram: ${collectionName.trim()}` : `Telegram: @${channel}`,
              slug,
              baseUrl: `https://t.me/${channel}`,
              description: `Telegram Channel Collector for @${channel}`,
              enabled: true,
              robotsPolicy: RobotsPolicy.RESPECT,
            });
            sourceId = newSource.id;
          } catch (err: any) {
            const res = await apiClient.get('/sources?pageSize=100');
            const found = res.data?.data?.find((s: any) => s.slug === slug || s.baseUrl.includes(channel));
            if (found) {
              sourceId = found.id;
            } else {
              throw err;
            }
          }
        }

        if (!sourceId) {
          throw new Error('Failed to create or find source for this Telegram channel');
        }

        // 2. Create TELEGRAM Collector
        const collectorName = collectionName.trim()
          ? `${collectionName.trim()} (@${channel})`
          : `Telegram @${channel} (${presetNames || 'Collector'})`;

        const newCollector = await createCollector.mutateAsync({
          sourceId,
          name: collectorName,
          type: 'TELEGRAM',
          enabled: true,
          configuration: {
            channels: [channel],
            messageLimit: 1000,
            downloadMedia: true,
            includeMediaTypes: tgMediaTypes,
            allowedExtensions: effectiveExtensions,
          },
        });

        // 3. Start Run
        const runRes = await runCollector.mutateAsync(newCollector.id);
        onClose();
        navigate(`/runs/${runRes.collectionRunId}`);
        return;
      }

      // Web Collector path
      let parsedUrl: URL;
      try {
        const rawUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
        parsedUrl = new URL(rawUrl);
      } catch {
        setError('Please enter a valid URL (e.g. https://example.com/books or https://t.me/channel_name)');
        setIsSubmitting(false);
        return;
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      const slug = hostname.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'source';

      let sourceId = sourcesData?.data?.find((s) => s.slug === slug || s.baseUrl.includes(hostname))?.id;
      if (!sourceId) {
        const sourceName = collectionName.trim() || hostname;
        try {
          const newSource = await createSource.mutateAsync({
            name: sourceName,
            slug,
            baseUrl: `${parsedUrl.protocol}//${hostname}`,
            description: `Auto-created source for ${hostname}`,
            enabled: true,
            robotsPolicy: RobotsPolicy.RESPECT,
          });
          sourceId = newSource.id;
        } catch (err: any) {
          const res = await apiClient.get('/sources?pageSize=100');
          const found = res.data?.data?.find((s: any) => s.slug === slug || s.baseUrl.includes(hostname));
          if (found) {
            sourceId = found.id;
          } else {
            throw err;
          }
        }
      }

      if (!sourceId) {
        throw new Error('Failed to create or find source for this URL');
      }

      const collectorName = collectionName.trim()
        ? `${collectionName.trim()} (${presetNames || 'Collector'})`
        : `${hostname} - ${presetNames || 'Collector'}`;

      const isMediaUrl =
        hostname.includes('youtube.com') ||
        hostname.includes('youtu.be') ||
        /\.(mp4|mp3|wav|m4a|ogg|flac|webm|mkv)$/i.test(parsedUrl.pathname) ||
        selectedPresets.includes('video');

      const isWebArticles = selectedPresets.includes('articles') || selectedPresets.includes('all');

      const collectorConfig: any = {
        startUrls: [parsedUrl.href],
        allowedDomains: [hostname],
        allowedUrlPatterns: [],
        excludedUrlPatterns: [],
        allowedExtensions: effectiveExtensions,
        allowedMimeTypes: [],
        maxDepth: 4,
        maxPages: 1000,
        maxFiles: 5000,
        requestDelayMs: 500,
        concurrency: 4,
        requestTimeoutSeconds: 30,
        maxRetries: 3,
        useBrowser: true,
        robotsEnabled: true,
        extractWebData: isWebArticles,
      };

      if (isMediaUrl) {
        collectorConfig.mediaUrl = parsedUrl.href;
      }

      const newCollector = await createCollector.mutateAsync({
        sourceId,
        name: collectorName,
        type: 'WEB',
        enabled: true,
        configuration: collectorConfig,
      });

      const runRes = await runCollector.mutateAsync(newCollector.id);
      onClose();
      navigate(`/runs/${runRes.collectionRunId}`);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to start collection run');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-elevated)] overflow-hidden my-auto">
        {/* Header - Pinned at top */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Quick Collection Launcher
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Enter any web URL or Telegram channel to begin extracting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-md)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Modal Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-error-400)] bg-[var(--color-error-500)]/10 border border-[var(--color-error-500)]/20 rounded-[var(--radius-md)]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Target URL / Channel Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                Target URL or Telegram Channel
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--color-text-muted)]">
                  {url.startsWith('@') || url.includes('t.me/') ? (
                    <Send className="w-4 h-4 text-sky-400" />
                  ) : (
                    <Globe className="w-4 h-4 text-[var(--color-brand-400)]" />
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="https://example.com/books or @channel_username"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)] transition-all font-mono"
                />
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Accepts any website URL, research publication, digital library, or Telegram channel name.
              </p>
            </div>

            {/* Multi-Select Category Presets */}
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
                {PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = selectedPresets.includes(preset.id);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => togglePreset(preset.id)}
                      className={`flex items-start gap-3 p-3 text-left rounded-xl border transition-colors cursor-pointer ${
                        isSelected
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

            {/* Collection Name & Options */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                  Collection / Source Name <span className="text-[var(--color-text-muted)] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kurdish Archive 2026"
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand-500)] focus:ring-1 focus:ring-[var(--color-brand-500)] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions - Pinned at bottom */}
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              <Zap className="w-4 h-4 mr-1.5" />
              {isSubmitting ? 'Starting Run...' : 'Launch Quick Collector'}
            </Button>
          </div>
        </form>
      </div>

      {/* Telegram Setup Helper Modal */}
      {showTelegramSetup && (
        <TelegramSetupModal
          isOpen={showTelegramSetup}
          onClose={() => setShowTelegramSetup(false)}
          onSuccess={() => {
            setShowTelegramSetup(false);
            setTelegramStatus({ is_authorized: true });
          }}
        />
      )}
    </div>
  );
};
