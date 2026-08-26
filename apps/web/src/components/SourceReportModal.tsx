import React, { useState, useMemo } from 'react';
import { Source, isTelegramCollector, isWebCollector } from '@odp/shared-types';
import { useCollectors } from '../hooks/useCollectors';
import { useRuns } from '../hooks/useRuns';
import { useFiles } from '../hooks/useFiles';
import { Button } from './Button';
import { QaiLogo } from './QaiLogo';
import { formatBytes } from '../lib/utils';
import { printSourceReportDocument, SourceReportData } from '../lib/generateSourceDoc';
import {
  FileText,
  Printer,
  X,
  Globe,
  Bot,
  PlaySquare,
  BookOpen,
  FolderTree,
  ExternalLink,
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
  const [activeTab, setActiveTab] = useState<'single' | 'all'>(source ? 'single' : 'all');
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    source?.id || allSources[0]?.id || ''
  );

  const currentSource = useMemo(() => {
    if (activeTab === 'single') {
      return (
        allSources.find((s) => s.id === selectedSourceId) || source || allSources[0] || null
      );
    }
    return null;
  }, [activeTab, selectedSourceId, source, allSources]);

  // Fetch collectors, runs, files for current scope
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

  // Subdomains & sections discovery
  const { subdomainsList, sectionsList, articlesCount, totalWords, avgQuality } = (() => {
    const subdomainsMap: Record<string, number> = {};
    const sectionsMap: Record<string, number> = {};
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
            const sec = `/${pathParts[0]}`;
            sectionsMap[sec] = (sectionsMap[sec] || 0) + 1;
          }
        } catch {
          // ignore
        }
      }

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
      }
    });

    return {
      subdomainsList: Object.entries(subdomainsMap).sort((a, b) => b[1] - a[1]),
      sectionsList: Object.entries(sectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 8),
      articlesCount: articles,
      totalWords: words,
      avgQuality: qualityCount > 0 ? Math.round(qualityTotal / qualityCount) : null,
    };
  })();

  const handlePrintDocument = () => {
    const sourcesToReport: SourceReportData[] =
      activeTab === 'all'
        ? allSources.map((s) => ({
            source: s,
            collectors: collectors.filter((c) => c.sourceId === s.id),
            runs: runs.filter((r) => r.sourceId === s.id),
            files: files.filter((f) => f.sourceId === s.id),
          }))
        : currentSource
        ? [
            {
              source: currentSource,
              collectors,
              runs,
              files,
            },
          ]
        : [];

    printSourceReportDocument({
      title:
        activeTab === 'all'
          ? 'Enterprise Sources & Data Platform Dossier'
          : `Source Audit — ${currentSource?.name || 'Report'}`,
      reportCode:
        activeTab === 'all'
          ? 'QAI-PLATFORM-ALL'
          : `QAI-SRC-${currentSource?.slug.toUpperCase() || 'REPORT'}`,
      sourcesData: sourcesToReport,
      isCombined: activeTab === 'all',
    });
  };

  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl h-[90vh] flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header Toolbar */}
        <div className="shrink-0 h-14 flex items-center justify-between px-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-primary)] truncate">
                Document & PDF Report Generator
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {allSources.length > 1 && (
              <div className="flex items-center rounded-lg border border-[var(--color-border-subtle)] p-0.5 bg-[var(--color-bg-base)] text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveTab('single')}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    activeTab === 'single'
                      ? 'bg-[var(--color-brand-500)] text-white font-semibold shadow-xs'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  Single Source
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-[var(--color-brand-500)] text-white font-semibold shadow-xs'
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
                className="text-xs h-7.5 py-1 px-2.5 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] focus:outline-none max-w-[150px] truncate"
              >
                {allSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrintDocument}
              className="gap-1.5 font-semibold text-xs h-7.5 px-3"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Generate & Print PDF</span>
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-bg-elevated)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Paper Document Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[var(--color-bg-base)] flex justify-center">
          <div className="w-full max-w-3xl bg-white dark:bg-[#111827] text-slate-900 dark:text-slate-100 p-8 sm:p-12 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 space-y-6 text-xs transition-all">
            {/* Header Branding */}
            <div className="flex items-start justify-between border-b-2 border-blue-600 pb-4">
              <div>
                <QaiLogo size="md" />
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">
                  Data Classification: <span className="font-bold text-emerald-600">OFFICIAL DATA REPORT</span>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-[10px] font-bold uppercase text-blue-600">
                  {activeTab === 'all' ? 'PLATFORM SOURCES DOSSIER' : 'SOURCE AUDIT & INVENTORY'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  ID: QAI-{activeTab === 'all' ? 'PLATFORM-ALL' : currentSource?.slug.toUpperCase() || 'SRC'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{reportDate}</div>
              </div>
            </div>

            {/* Profile Overview Card */}
            {activeTab === 'all' ? (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  All Sources Platform Portfolio ({allSources.length} Sources)
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Consolidated inventory of all data collection channels, discovered domains, and extracted contents.
                </p>
              </div>
            ) : currentSource ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-[9px] uppercase font-mono text-slate-500 font-bold">Source Name</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>{currentSource.name}</span>
                  </div>
                  <div className="text-[10px] font-mono text-blue-600 mt-0.5 break-all">
                    {currentSource.baseUrl}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-mono text-slate-500 font-bold">Identifier / Slug</div>
                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded inline-block text-[11px]">
                    {currentSource.slug}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Robots: <strong>{currentSource.robotsPolicy}</strong>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-mono text-slate-500 font-bold">Storage Partition</div>
                  <div className="font-mono text-blue-600 font-bold mt-1 text-[11px]">
                    00_raw/web/{currentSource.slug}/
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Collectors: <strong>{collectors.length} configured</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {/* KPI Boxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
                <div className="text-base font-extrabold font-mono text-slate-900 dark:text-slate-100">
                  {totalRuns}
                </div>
                <div className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Total Runs</div>
                <div className="text-[9px] text-emerald-600 font-semibold">{completedRuns} completed</div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
                <div className="text-base font-extrabold font-mono text-slate-900 dark:text-slate-100">
                  {totalPagesCrawled.toLocaleString()}
                </div>
                <div className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Pages Crawled</div>
                <div className="text-[9px] text-slate-400">HTML & DOM</div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
                <div className="text-base font-extrabold font-mono text-slate-900 dark:text-slate-100">
                  {totalFilesDownloaded.toLocaleString()}
                </div>
                <div className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Assets Collected</div>
                <div className="text-[9px] text-slate-400">Files & Docs</div>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
                <div className="text-base font-extrabold font-mono text-slate-900 dark:text-slate-100">
                  {formatBytes(totalBytes)}
                </div>
                <div className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Total Volume</div>
                <div className="text-[9px] text-slate-400">Raw bytes</div>
              </div>
            </div>

            {/* Subdomains & Sections */}
            {(subdomainsList.length > 0 || sectionsList.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold uppercase text-[10px] text-slate-700 dark:text-slate-300">
                    <Globe className="w-3.5 h-3.5 text-blue-500" />
                    <span>Discovered Subdomains ({subdomainsList.length})</span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {subdomainsList.map(([host, count]) => (
                      <div
                        key={host}
                        className="flex items-center justify-between py-1 px-2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
                      >
                        <span className="font-mono font-medium truncate max-w-[180px]">{host}</span>
                        <span className="font-mono text-blue-600 font-bold text-[10px]">
                          {count} URLs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold uppercase text-[10px] text-slate-700 dark:text-slate-300">
                    <FolderTree className="w-3.5 h-3.5 text-cyan-500" />
                    <span>Website Sections & Paths</span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {sectionsList.map(([sec, count]) => (
                      <div
                        key={sec}
                        className="flex items-center justify-between py-1 px-2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
                      >
                        <span className="font-mono font-semibold text-cyan-600">{sec}</span>
                        <span className="font-mono text-slate-500 text-[10px]">{count} items</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Extracted Articles Card */}
            {articlesCount > 0 && (
              <div className="p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase text-emerald-700 dark:text-emerald-400">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Harvested Web Articles & Extracted Text</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50">
                    <div className="text-sm font-extrabold font-mono text-emerald-600">
                      {articlesCount.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-500">Articles</div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50">
                    <div className="text-sm font-extrabold font-mono text-slate-900 dark:text-slate-100">
                      {totalWords.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-500">Words Extracted</div>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50">
                    <div className="text-sm font-extrabold font-mono text-cyan-600">
                      {avgQuality !== null ? `${avgQuality}/100` : '—'}
                    </div>
                    <div className="text-[9px] text-slate-500">Avg Quality</div>
                  </div>
                </div>
              </div>
            )}

            {/* Collectors / Sources Table */}
            {activeTab === 'all' ? (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                  All Cataloged Sources ({allSources.length})
                </div>
                <table className="w-full text-left text-[11px] border border-slate-200 dark:border-slate-800 rounded">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-mono text-[9px] uppercase border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Slug</th>
                      <th className="p-2">Base URL</th>
                      <th className="p-2 text-right">Robots</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {allSources.map((s) => (
                      <tr key={s.id}>
                        <td className="p-2 font-bold">{s.name}</td>
                        <td className="p-2 font-mono text-blue-600">{s.slug}</td>
                        <td className="p-2 font-mono text-slate-500 truncate max-w-[200px]">{s.baseUrl}</td>
                        <td className="p-2 text-right font-mono">{s.robotsPolicy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                  Configured Collectors ({collectors.length})
                </div>
                <table className="w-full text-left text-[11px] border border-slate-200 dark:border-slate-800 rounded">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-mono text-[9px] uppercase border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Seed / Channel</th>
                      <th className="p-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {collectors.map((c) => (
                      <tr key={c.id}>
                        <td className="p-2 font-bold">{c.name}</td>
                        <td className="p-2 font-mono">{c.type}</td>
                        <td className="p-2 font-mono text-slate-500 truncate max-w-[200px]">
                          {isWebCollector(c)
                            ? c.configuration.startUrls?.[0] || '—'
                            : isTelegramCollector(c)
                            ? `@${c.configuration.channels?.[0] || '—'}`
                            : '—'}
                        </td>
                        <td className="p-2 text-right font-bold text-emerald-600">
                          {c.enabled ? 'Enabled' : 'Disabled'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Document Footer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <div>Organization Data Platform (ODP) • AI Collection Engine</div>
              <div>Confidential & Proprietary Document</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
