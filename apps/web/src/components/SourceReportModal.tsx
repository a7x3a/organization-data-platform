import React, { useRef, useState, useMemo } from 'react';
import { Source, isTelegramCollector, isWebCollector, CollectedFile } from '@odp/shared-types';
import { useCollectors } from '../hooks/useCollectors';
import { useRuns } from '../hooks/useRuns';
import { useFiles } from '../hooks/useFiles';
import { Button } from './Button';
import { QaiLogo } from './QaiLogo';
import { formatBytes } from '../lib/utils';
import {
  FileText,
  Printer,
  X,
  Globe,
  Bot,
  PlaySquare,
  FileArchive,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  HardDrive,
  Hash,
  Sparkles,
  ExternalLink,
  BookOpen,
  FolderTree,
} from 'lucide-react';

interface SourceReportModalProps {
  source: Source | null;
  allSources?: Source[];
  isOpen: boolean;
  onClose: () => void;
}

export const SourceReportModal: React.FC<SourceReportModalProps> = ({
  source,
  allSources = [],
  isOpen,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'single' | 'all'>(source ? 'single' : 'all');
  const [selectedSourceId, setSelectedSourceId] = useState<string>(source?.id || allSources[0]?.id || '');

  const currentSource = useMemo(() => {
    if (activeTab === 'single') {
      return allSources.find((s) => s.id === selectedSourceId) || source || allSources[0] || null;
    }
    return null;
  }, [activeTab, selectedSourceId, source, allSources]);

  // Fetch collectors, runs, files
  const { data: collectorsData } = useCollectors({
    sourceId: activeTab === 'single' ? currentSource?.id : undefined,
    pageSize: 100,
  });

  const { data: runsData } = useRuns({
    sourceId: activeTab === 'single' ? currentSource?.id : undefined,
    pageSize: 100,
  });

  const { data: filesData } = useFiles({
    sourceId: activeTab === 'single' ? currentSource?.id : undefined,
    pageSize: 200,
  });

  if (!isOpen) return null;

  const collectors = collectorsData?.data || [];
  const runs = runsData?.data || [];
  const files = filesData?.data || [];

  // Metrics
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === 'COMPLETED').length;
  const totalPagesCrawled = runs.reduce((acc, r) => acc + (r.pagesCrawled || 0), 0);
  const totalFilesDownloaded = runs.reduce((acc, r) => acc + (r.filesDownloaded || 0), 0);
  const totalBytes = files.reduce((acc, f) => acc + (Number(f.fileSize) || 0), 0);

  // File extension breakdown
  const extCounts: Record<string, number> = {};
  files.forEach((f) => {
    const ext = f.extension?.toLowerCase().replace('.', '') || 'unknown';
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  });

  // Website subdomains & URL sections discovery
  const { subdomainsList, sectionsList, articlesCount, totalWords, avgQuality, languagesList } = (() => {
    const subdomainsMap: Record<string, number> = {};
    const sectionsMap: Record<string, number> = {};
    const languagesMap: Record<string, number> = {};
    let articles = 0;
    let words = 0;
    let qualityTotal = 0;
    let qualityCount = 0;

    files.forEach((f) => {
      const urlStr = f.sourceUrl;
      if (urlStr) {
        try {
          const u = new URL(urlStr);
          const hostname = u.hostname.toLowerCase();
          subdomainsMap[hostname] = (subdomainsMap[hostname] || 0) + 1;

          const pathParts = u.pathname.split('/').filter(Boolean);
          if (pathParts.length > 0) {
            const section = `/${pathParts[0]}`;
            sectionsMap[section] = (sectionsMap[section] || 0) + 1;
          }
        } catch {
          // ignore
        }
      }

      // Check article metadata
      const meta = f.metadata as Record<string, any> | undefined;
      if (meta) {
        if (meta.body_text || meta.paragraphs || meta.title) {
          articles++;
          if (meta.word_count) words += Number(meta.word_count) || 0;
        }
        if (meta.quality?.overall_score !== undefined) {
          qualityTotal += Number(meta.quality.overall_score);
          qualityCount++;
        }
        const lang = meta.language?.language_name || meta.language?.language;
        if (lang) {
          languagesMap[lang] = (languagesMap[lang] || 0) + 1;
        }
      }
    });

    return {
      subdomainsList: Object.entries(subdomainsMap).sort((a, b) => b[1] - a[1]),
      sectionsList: Object.entries(sectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 8),
      articlesCount: articles,
      totalWords: words,
      avgQuality: qualityCount > 0 ? Math.round(qualityTotal / qualityCount) : null,
      languagesList: Object.entries(languagesMap).sort((a, b) => b[1] - a[1]),
    };
  })();

  const handlePrint = () => {
    window.print();
  };

  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-4xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:w-full print:rounded-none">
        
        {/* Modal Toolbar (hidden in print) */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--color-brand-400)] shrink-0" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
              Source Intelligence & Inventory Report
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            {allSources.length > 1 && (
              <div className="flex items-center rounded-lg border border-[var(--color-border-subtle)] p-0.5 bg-[var(--color-bg-base)] text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveTab('single')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    activeTab === 'single'
                      ? 'bg-[var(--color-brand-500)] text-white font-semibold'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  Single Source
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-[var(--color-brand-500)] text-white font-semibold'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  All Sources Combined
                </button>
              </div>
            )}

            {activeTab === 'single' && allSources.length > 1 && (
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="text-xs py-1 px-2.5 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none"
              >
                {allSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <Button variant="primary" size="sm" onClick={handlePrint} className="gap-1.5 font-medium text-xs h-7.5 px-3">
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </Button>

            <button
              onClick={onClose}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-bg-elevated)] transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Report Document Body */}
        <div
          ref={printRef}
          className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-6 bg-white dark:bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] print:p-0 print:overflow-visible font-sans leading-relaxed"
        >
          {/* Header Branding */}
          <div className="flex items-start justify-between border-b-2 border-[var(--color-brand-500)] pb-4">
            <div>
              <QaiLogo size="lg" />
              <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-1">
                Data Classification: <span className="font-semibold text-emerald-600 dark:text-emerald-400">ORGANIZATION RAW INTELLIGENCE</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-brand-500)]">
                {activeTab === 'all' ? 'All Sources Platform Dossier' : 'Source Audit & Inventory'}
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
                Report Code: <span className="text-[var(--color-text-primary)] font-semibold">QAI-{activeTab === 'all' ? 'PLATFORM-ALL' : currentSource?.slug.toUpperCase() || 'SRC'}</span>
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
                Generated: {reportDate}
              </div>
            </div>
          </div>

          {/* Active Profile Header */}
          {activeTab === 'all' ? (
            <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]">
              <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                Platform Sources & Data Collection Portfolio
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Comprehensive overview of all {allSources.length} registered data sources, active ingestion pipelines, discovered subdomains, and harvested content.
              </p>
            </div>
          ) : currentSource ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-xs">
              <div>
                <div className="text-[10px] uppercase font-mono text-[var(--color-text-muted)] font-bold">Source Name</div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)] mt-0.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[var(--color-brand-400)] shrink-0" />
                  <span>{currentSource.name}</span>
                </div>
                <div className="text-[11px] font-mono text-[var(--color-text-muted)] mt-0.5 break-all">
                  {currentSource.baseUrl}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-mono text-[var(--color-text-muted)] font-bold">Identifier / Slug</div>
                <div className="font-mono font-semibold text-[var(--color-text-primary)] mt-1 px-2 py-0.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded inline-block">
                  {currentSource.slug}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  Robots Policy: <span className="font-semibold text-[var(--color-text-primary)]">{currentSource.robotsPolicy}</span>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-mono text-[var(--color-text-muted)] font-bold">Storage Partition</div>
                <div className="font-mono text-[var(--color-brand-400)] mt-1 font-semibold">
                  00_raw/web/{currentSource.slug}/
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                  Active Collectors: <span className="font-semibold text-[var(--color-text-primary)]">{collectors.length}</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* KPI Highlights Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase font-semibold">Total Runs</div>
              <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                {totalRuns}
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                {completedRuns} completed runs
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase font-semibold">Pages Crawled</div>
              <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                {totalPagesCrawled.toLocaleString()}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Crawled DOM Pages
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase font-semibold">Collected Assets</div>
              <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                {totalFilesDownloaded.toLocaleString()}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Files & Extracted Docs
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase font-semibold">Total Volume</div>
              <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                {formatBytes(totalBytes)}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Raw byte volume
              </div>
            </div>
          </div>

          {/* Discovered Subdomains & Website Sections */}
          {(subdomainsList.length > 0 || sectionsList.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Subdomains */}
              <div className="space-y-2 p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                <div className="flex items-center gap-1.5 border-b border-[var(--color-border-subtle)] pb-2">
                  <Globe className="w-3.5 h-3.5 text-[var(--color-brand-400)]" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                    Discovered Subdomains ({subdomainsList.length})
                  </h3>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {subdomainsList.map(([host, count]) => (
                    <div key={host} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[var(--color-bg-base)]">
                      <span className="font-mono font-medium text-[var(--color-text-primary)] truncate max-w-[200px]">{host}</span>
                      <span className="font-mono text-[11px] text-[var(--color-brand-400)] bg-[var(--color-bg-overlay)] px-2 py-0.5 rounded">
                        {count} {count === 1 ? 'URL' : 'URLs'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Website Sections & Parts */}
              <div className="space-y-2 p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                <div className="flex items-center gap-1.5 border-b border-[var(--color-border-subtle)] pb-2">
                  <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                    Targeted Sections & Categories
                  </h3>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {sectionsList.map(([sec, count]) => (
                    <div key={sec} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[var(--color-bg-base)]">
                      <span className="font-mono font-semibold text-[var(--color-text-secondary)]">{sec}</span>
                      <span className="font-mono text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                        {count} items
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Web Data & Article Extraction Intelligence */}
          {articlesCount > 0 && (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2.5">
              <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-2">
                <BookOpen className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Harvested Article & Web Document Content
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-mono">Total Articles</div>
                  <div className="text-base font-bold font-mono text-[var(--color-text-primary)] mt-0.5">
                    {articlesCount.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-mono">Word Count</div>
                  <div className="text-base font-bold font-mono text-[var(--color-text-primary)] mt-0.5">
                    {totalWords.toLocaleString()} words
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-mono">Avg Quality Score</div>
                  <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                    {avgQuality !== null ? `${avgQuality}/100` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-mono">Languages Detected</div>
                  <div className="text-[11px] font-mono font-medium text-[var(--color-text-secondary)] mt-0.5">
                    {languagesList.slice(0, 3).map(([l]) => l).join(', ') || 'Kurdish, English'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All Sources Catalog Table (if All Sources selected) */}
          {activeTab === 'all' && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2">
                <Globe className="w-4 h-4 text-[var(--color-brand-400)]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                  Registered Data Sources ({allSources.length})
                </h3>
              </div>
              <div className="border border-[var(--color-border-subtle)] rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[var(--color-bg-base)] text-[var(--color-text-muted)] font-mono text-[10px] uppercase border-b border-[var(--color-border-subtle)]">
                    <tr>
                      <th className="p-2.5">Source Name</th>
                      <th className="p-2.5">Slug</th>
                      <th className="p-2.5">Base URL</th>
                      <th className="p-2.5">Robots</th>
                      <th className="p-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {allSources.map((s) => (
                      <tr key={s.id}>
                        <td className="p-2.5 font-bold text-[var(--color-text-primary)]">{s.name}</td>
                        <td className="p-2.5 font-mono text-[11px] text-[var(--color-brand-400)]">{s.slug}</td>
                        <td className="p-2.5 font-mono text-[11px] text-[var(--color-text-muted)] truncate max-w-[200px]">{s.baseUrl}</td>
                        <td className="p-2.5 font-mono text-[11px]">{s.robotsPolicy}</td>
                        <td className="p-2.5 text-right font-mono text-[11px] text-emerald-500 font-semibold">Active</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Configured Collectors Breakdown */}
          {activeTab === 'single' && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2">
                <Bot className="w-4 h-4 text-[var(--color-brand-400)]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                  Configured Collectors ({collectors.length})
                </h3>
              </div>

              {collectors.length > 0 ? (
                <div className="border border-[var(--color-border-subtle)] rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-[var(--color-bg-base)] text-[var(--color-text-muted)] font-mono text-[10px] uppercase border-b border-[var(--color-border-subtle)]">
                      <tr>
                        <th className="p-2.5">Collector Name</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Target / Seed</th>
                        <th className="p-2.5">Depth / Limits</th>
                        <th className="p-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border-subtle)] font-sans">
                      {collectors.map((c) => (
                        <tr key={c.id}>
                          <td className="p-2.5 font-semibold text-[var(--color-text-primary)]">{c.name}</td>
                          <td className="p-2.5 font-mono text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)]">
                              {c.type}
                            </span>
                          </td>
                          <td className="p-2.5 text-[var(--color-text-secondary)] font-mono text-[11px] truncate max-w-[200px]">
                            {isWebCollector(c)
                              ? c.configuration.startUrls?.[0] || '—'
                              : isTelegramCollector(c)
                              ? `@${c.configuration.channels?.[0] || '—'}`
                              : '—'}
                          </td>
                          <td className="p-2.5 text-[var(--color-text-muted)] font-mono text-[11px]">
                            {isWebCollector(c)
                              ? `Max ${c.configuration.maxPages} pages (Depth ${c.configuration.maxDepth})`
                              : isTelegramCollector(c)
                              ? `Limit ${c.configuration.messageLimit} msgs`
                              : '—'}
                          </td>
                          <td className="p-2.5 text-right font-mono text-[11px]">
                            <span className={c.enabled ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-[var(--color-text-muted)]'}>
                              {c.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-[var(--color-text-muted)] py-3 text-center border border-dashed rounded-xl">
                  No collectors configured for this source.
                </div>
              )}
            </div>
          )}

          {/* Downloaded Formats & Content Distribution */}
          {Object.keys(extCounts).length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2">
                <Layers className="w-4 h-4 text-[var(--color-brand-400)]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                  Asset Extension Distribution
                </h3>
              </div>

              <div className="flex flex-wrap gap-2">
                {Object.entries(extCounts).map(([ext, count]) => (
                  <div
                    key={ext}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-xs"
                  >
                    <span className="font-mono font-bold uppercase text-[var(--color-brand-400)]">.{ext}</span>
                    <span className="font-mono font-semibold text-[var(--color-text-primary)]">{count} files</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Collection Runs */}
          {runs.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2">
                <PlaySquare className="w-4 h-4 text-[var(--color-brand-400)]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                  Recent Collection Runs ({runs.slice(0, 5).length})
                </h3>
              </div>

              <div className="border border-[var(--color-border-subtle)] rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[var(--color-bg-base)] text-[var(--color-text-muted)] font-mono text-[10px] uppercase border-b border-[var(--color-border-subtle)]">
                    <tr>
                      <th className="p-2.5">Run ID</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Crawled</th>
                      <th className="p-2.5">Downloaded</th>
                      <th className="p-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)] font-mono text-[11px]">
                    {runs.slice(0, 5).map((r) => (
                      <tr key={r.id}>
                        <td className="p-2.5 font-bold text-[var(--color-text-primary)]">{r.runId.slice(0, 16)}…</td>
                        <td className="p-2.5 text-[var(--color-text-muted)]">
                          {r.startedAt ? new Date(r.startedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-2.5 text-[var(--color-text-secondary)]">{r.pagesCrawled}</td>
                        <td className="p-2.5 text-[var(--color-text-secondary)]">{r.filesDownloaded}</td>
                        <td className="p-2.5 text-right font-semibold">
                          <span
                            className={
                              r.status === 'COMPLETED'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : r.status === 'FAILED'
                                ? 'text-rose-500'
                                : 'text-amber-500'
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report Footer */}
          <div className="pt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)]">
            <div>Organization Data Platform (ODP) • Automated Pipeline Audit</div>
            <div>Confidential & Proprietary Document</div>
          </div>
        </div>
      </div>
    </div>
  );
};
