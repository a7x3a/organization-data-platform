import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useCreateSource, useSources } from '../hooks/useSources';
import { useCreateCollector, useRunCollector } from '../hooks/useCollectors';
import { Button } from './Button';
import { Input } from './Input';
import { Zap, BookOpen, FileText, Music, Database, X, Sparkles, CheckCircle2, Send, Globe, Monitor, Video, Image, Archive } from 'lucide-react';
import { RobotsPolicy } from '@odp/shared-types';
import { TelegramSetupModal } from './TelegramSetupModal';

interface QuickCollectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PresetType = 'books' | 'documents' | 'audio' | 'video' | 'images' | 'datasets' | 'archives' | 'all';

const PRESETS: { id: PresetType; label: string; description: string; icon: React.ElementType; extensions: string[] }[] = [
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
    id: 'audio',
    label: 'Audio & Recordings',
    description: 'MP3, WAV, FLAC, M4A, and speech audio files',
    icon: Music,
    extensions: ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac'],
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
    description: 'Discover all supported media and document formats',
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
  const [useBrowser, setUseBrowser] = useState(false);
  const [extractWebData, setExtractWebData] = useState(false);
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

    const tgMediaTypes: Array<'photo' | 'video' | 'audio' | 'document'> = isAll
      ? ['photo', 'video', 'audio', 'document']
      : Array.from(
          new Set(
            selectedPresets.flatMap((p) => {
              if (p === 'audio') return ['audio', 'document'];
              if (p === 'video') return ['video', 'document'];
              if (p === 'images') return ['photo', 'document'];
              return ['document'];
            }) as Array<'photo' | 'video' | 'audio' | 'document'>
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
        selectedPresets.includes('audio') ||
        selectedPresets.includes('video');

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
        useBrowser,
        robotsEnabled: true,
        extractWebData,
      };

      if (isMediaUrl) {
        collectorConfig.mediaUrl = parsedUrl.href;
        collectorConfig.audioChunkSeconds = 60;
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
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Quick Collect
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Start collecting books, files & datasets in 1 click
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

        {/* Form Container with scrollable body & pinned footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {error && (
              <div className="p-3 text-xs rounded-[var(--radius-md)] bg-[var(--color-error-bg)] text-[var(--color-error-400)] border border-[var(--color-error-400)]/20 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">{error}</div>
                {error.includes('Telegram') && (
                  <button
                    type="button"
                    onClick={() => setShowTelegramSetup(true)}
                    className="shrink-0 px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    Setup Telegram Login
                  </button>
                )}
              </div>
            )}

            {/* Quick status bar for Telegram */}
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] text-xs">
              <div className="flex items-center gap-2">
                <Send className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[var(--color-text-secondary)] font-medium">Telegram Scraper Engine:</span>
                <span className={telegramStatus?.is_authorized ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {telegramStatus?.is_authorized ? 'Authorized & Ready' : 'Not Logged In'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/settings');
                }}
                className="text-xs text-[var(--color-brand-400)] hover:underline font-medium flex items-center gap-1"
              >
                {telegramStatus?.is_authorized ? 'Account Settings →' : 'Setup in Settings →'}
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Target Website or Telegram Channel
              </label>
              <Input
                type="text"
                placeholder="e.g. https://gov.krd/publications/ or https://t.me/kurdish_books or @channel"
                value={url}
                onChange={(e) => {
                  const val = e.target.value;
                  try {
                    if (val.includes('%')) {
                      setUrl(decodeURI(val));
                      return;
                    }
                  } catch {
                    // Fallback
                  }
                  setUrl(val);
                }}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Select File Categories / Presets <span className="text-[var(--color-text-muted)] font-normal">(Multi-Select)</span>
                </label>
                <span className="text-[11px] font-mono text-[var(--color-brand-400)] font-medium">
                  {selectedPresets.includes('all') ? 'All Formats' : `${selectedPresets.length} selected`}
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

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--color-text-secondary)] block">
                  Collection Name <span className="text-[var(--color-text-muted)] font-normal">(Optional)</span>
                </label>
                <Input
                  placeholder="e.g. Kurdish Archive 2026"
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                />
              </div>

              {/* Autonomous Engine Selection */}
              <div
                onClick={() => setUseBrowser(!useBrowser)}
                className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${useBrowser
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

              {/* Extract Web Data & Article Texts */}
              <div
                onClick={() => setExtractWebData(!extractWebData)}
                className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${extractWebData
                  ? 'border-cyan-500 bg-cyan-500/10 shadow-sm text-[var(--color-text-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-base)] hover:border-[var(--color-border-strong)] text-[var(--color-text-secondary)]'
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${extractWebData ? 'bg-cyan-500 text-white' : 'bg-[var(--color-bg-overlay)] text-cyan-400'
                    }`}>
                    <Database className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span>Extract Web Data & Article Texts</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/20 text-cyan-400">
                        JSON Datasets
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                      {extractWebData
                        ? 'Enabled: Extracts clean body text, article content, and headings into structured JSON data.'
                        : 'Off: Only downloadable files (PDF, audio, docs) are collected.'}
                    </p>
                  </div>
                </div>

                <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${extractWebData ? 'bg-cyan-500' : 'bg-[var(--color-border-strong)]'
                  }`}>
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${extractWebData ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                </div>
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
              {isSubmitting ? 'Starting...' : 'Start Collecting'}
            </Button>
          </div>
        </form>
      </div>

      <TelegramSetupModal
        isOpen={showTelegramSetup}
        onClose={() => setShowTelegramSetup(false)}
        onSuccess={() => {
          apiClient.get('/telegram/status').then((r: any) => setTelegramStatus(r.data));
        }}
      />
    </div>
  );
};
