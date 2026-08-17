import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useCreateSource, useSources } from '../hooks/useSources';
import { useCreateCollector, useRunCollector } from '../hooks/useCollectors';
import { Button } from './Button';
import { Input } from './Input';
import { Zap, BookOpen, FileText, Music, Database, X, Sparkles, CheckCircle2, Send } from 'lucide-react';
import { RobotsPolicy } from '@odp/shared-types';
import { TelegramSetupModal } from './TelegramSetupModal';

interface QuickCollectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PresetType = 'books' | 'documents' | 'audio' | 'datasets' | 'all';

const PRESETS: { id: PresetType; label: string; description: string; icon: React.ElementType; extensions: string[] }[] = [
  {
    id: 'books',
    label: 'Books & Ebooks',
    description: 'PDF books, EPUB ebooks, MOBI, and AZW3 documents',
    icon: BookOpen,
    extensions: ['.pdf', '.epub', '.mobi', '.azw3', '.fb2'],
  },
  {
    id: 'documents',
    label: 'Research Documents',
    description: 'Word DOCX, PDF reports, ODT, and office files',
    icon: FileText,
    extensions: ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md'],
  },
  {
    id: 'audio',
    label: 'Audiobooks & Media',
    description: 'MP3, WAV, FLAC, and audio lectures',
    icon: Music,
    extensions: ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac'],
  },
  {
    id: 'datasets',
    label: 'Data & Knowledge',
    description: 'Parquet, JSONL, CSV, TSV, and XML datasets',
    icon: Database,
    extensions: ['.parquet', '.jsonl', '.csv', '.tsv', '.json', '.xml'],
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
  const [selectedPreset, setSelectedPreset] = useState<PresetType>('books');
  const [useBrowser, setUseBrowser] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ is_authorized: boolean } | null>(null);

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
    const presetInfo = PRESETS.find((p) => p.id === selectedPreset);

    setIsSubmitting(true);
    try {
      if (tgTarget.isTelegram) {
        const channel = tgTarget.channelUsername || 'channel';
        const slug = `telegram-${channel.toLowerCase()}`;

        // Check auth status
        if (telegramStatus && !telegramStatus.is_authorized) {
          setError('Telegram scraper is not logged in yet. Please click "Setup Telegram Login" to authorize.');
          setIsSubmitting(false);
          return;
        }

        // 1. Find or create Source for Telegram
        let sourceId = sourcesData?.data?.find((s) => s.slug === slug || s.baseUrl.includes(channel))?.id;
        if (!sourceId) {
          const newSource = await createSource.mutateAsync({
            name: collectionName.trim() ? `Telegram: ${collectionName.trim()}` : `Telegram: @${channel}`,
            slug,
            baseUrl: `https://t.me/${channel}`,
            description: `Telegram Channel Collector for @${channel}`,
            enabled: true,
            robotsPolicy: RobotsPolicy.RESPECT,
          });
          sourceId = newSource.id;
        }

        // 2. Create TELEGRAM Collector
        const collectorName = collectionName.trim()
          ? `${collectionName.trim()} (@${channel})`
          : `Telegram @${channel} (${presetInfo?.label || 'Collector'})`;

        const newCollector = await createCollector.mutateAsync({
          sourceId,
          name: collectorName,
          type: 'TELEGRAM',
          enabled: true,
          configuration: {
            channels: [channel],
            messageLimit: 1000,
            downloadMedia: true,
            allowedExtensions: presetInfo?.extensions || [],
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
        const newSource = await createSource.mutateAsync({
          name: sourceName,
          slug,
          baseUrl: `${parsedUrl.protocol}//${hostname}`,
          description: `Auto-created source for ${hostname}`,
          enabled: true,
          robotsPolicy: RobotsPolicy.RESPECT,
        });
        sourceId = newSource.id;
      }

      const collectorName = collectionName.trim()
        ? `${collectionName.trim()} (${presetInfo?.label || 'Collector'})`
        : `${hostname} - ${presetInfo?.label || 'Collector'}`;

      const isMediaUrl =
        hostname.includes('youtube.com') ||
        hostname.includes('youtu.be') ||
        /\.(mp4|mp3|wav|m4a|ogg|flac|webm|mkv)$/i.test(parsedUrl.pathname) ||
        selectedPreset === 'audio';

      const collectorConfig: any = {
        startUrls: [parsedUrl.href],
        allowedDomains: [hostname],
        allowedUrlPatterns: [],
        excludedUrlPatterns: [],
        allowedExtensions: presetInfo?.extensions || [],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-elevated)] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Quick Collect
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Start collecting books & documents in 1 click
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-md)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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
              onClick={() => setShowTelegramSetup(true)}
              className="text-xs text-[var(--color-brand-400)] hover:underline font-medium"
            >
              {telegramStatus?.is_authorized ? 'Account Settings' : 'Setup Account'}
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
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Select Collection Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESETS.map((preset) => {
                const Icon = preset.icon;
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`flex items-start gap-3 p-3 text-left rounded-sm border transition-colors ${isSelected
                        ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 text-[var(--color-text-primary)] font-medium'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'
                      }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-[var(--color-brand-400)]' : ''}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate flex items-center justify-between">
                        <span>{preset.label}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-brand-400)] shrink-0 ml-1" />}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Collection Name <span className="text-[var(--color-text-muted)] font-normal">(Optional)</span>
              </label>
              <Input
                placeholder="e.g. Kurdish Archive 2026"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2.5 p-2.5 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-base)] hover:border-[var(--color-border-strong)] transition-colors h-[42px]">
              <input
                type="checkbox"
                id="useBrowser"
                checked={useBrowser}
                onChange={(e) => setUseBrowser(e.target.checked)}
                className="w-4 h-4 rounded-xs border-[var(--color-border)] text-[var(--color-brand-500)] cursor-pointer accent-[var(--color-brand-500)]"
              />
              <label htmlFor="useBrowser" className="text-xs font-medium text-[var(--color-text-secondary)] cursor-pointer select-none">
                Force Playwright Browser <span className="text-[var(--color-text-muted)] font-normal">(JS SPAs)</span>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
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
