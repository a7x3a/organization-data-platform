import React, { useRef } from 'react';
import { Source, isTelegramCollector, isWebCollector } from '@odp/shared-types';
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
} from 'lucide-react';

interface SourceReportModalProps {
  source: Source | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SourceReportModal: React.FC<SourceReportModalProps> = ({
  source,
  isOpen,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const { data: collectorsData, isLoading: collectorsLoading } = useCollectors({
    sourceId: source?.id,
    pageSize: 100,
  });

  const { data: runsData, isLoading: runsLoading } = useRuns({
    sourceId: source?.id,
    pageSize: 100,
  });

  const { data: filesData, isLoading: filesLoading } = useFiles({
    sourceId: source?.id,
    pageSize: 100,
  });

  if (!isOpen || !source) return null;

  const collectors = collectorsData?.data || [];
  const runs = runsData?.data || [];
  const files = filesData?.data || [];

  // Computed metrics
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === 'COMPLETED').length;
  const totalPagesCrawled = runs.reduce((acc, r) => acc + (r.pagesCrawled || 0), 0);
  const totalFilesDownloaded = runs.reduce((acc, r) => acc + (r.filesDownloaded || 0), 0);
  const totalBytes = files.reduce((acc, f) => acc + (Number(f.fileSize) || 0), 0);

  // File categories breakdown
  const extCounts: Record<string, number> = {};
  files.forEach((f) => {
    const ext = f.extension?.toLowerCase().replace('.', '') || 'unknown';
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  });

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-4xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:w-full print:rounded-none">
        
        {/* Modal Toolbar (hidden in print) */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--color-brand-400)]" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
              Source Intelligence & Collection Report
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handlePrint} className="gap-1.5 font-medium">
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-bg-base)] transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Report Document Body */}
        <div
          ref={printRef}
          className="flex-1 overflow-y-auto p-8 space-y-6 bg-white dark:bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] print:p-6 print:overflow-visible"
        >
          {/* Header Branding */}
          <div className="flex items-start justify-between border-b-2 border-[var(--color-brand-500)]/30 pb-5">
            <div>
              <QaiLogo size="lg" />
              <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-2">
                Document Classification: <span className="font-semibold text-emerald-600 dark:text-emerald-400">ORGANIZATION DATA REPORT</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-brand-500)]">
                Source Audit & Metrics
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
                Report ID: <span className="text-[var(--color-text-primary)] font-semibold">QAI-SRC-{source.slug.toUpperCase()}</span>
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
                Generated: {reportDate}
              </div>
            </div>
          </div>

          {/* Source Overview Profile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]">
            <div>
              <div className="text-[10px] uppercase font-mono text-[var(--color-text-muted)] font-bold">Source Name</div>
              <div className="text-sm font-semibold text-[var(--color-text-primary)] mt-0.5 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[var(--color-brand-400)] shrink-0" />
                <span>{source.name}</span>
              </div>
              <div className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5 break-all">
                {source.baseUrl}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-mono text-[var(--color-text-muted)] font-bold">System Identifier / Slug</div>
              <div className="text-xs font-mono font-semibold text-[var(--color-text-primary)] mt-1 px-2 py-0.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded inline-block">
                {source.slug}
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                Robots.txt: <span className="font-semibold text-[var(--color-text-primary)]">{source.robotsPolicy}</span>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-mono text-[var(--color-text-muted)] font-bold">Storage Partition</div>
              <div className="text-xs font-mono text-[var(--color-brand-500)] mt-1 font-semibold">
                00_raw/web/{source.slug}/
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] mt-1">
                Active Collectors: <span className="font-semibold text-[var(--color-text-primary)]">{collectors.length}</span>
              </div>
            </div>
          </div>

          {/* Key Metric Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Total Runs</div>
              <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                {totalRuns}
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                {completedRuns} completed successfully
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Pages Crawled</div>
              <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                {totalPagesCrawled.toLocaleString()}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                HTML & Dynamic DOM
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Files Downloaded</div>
              <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                {totalFilesDownloaded.toLocaleString()}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Saved in raw storage
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">Total Volume</div>
              <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                {formatBytes(totalBytes)}
              </div>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Raw byte assets
              </div>
            </div>
          </div>

          {/* Configured Collectors Breakdown */}
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
                          <span className={c.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--color-text-muted)]'}>
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
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2">
              <PlaySquare className="w-4 h-4 text-[var(--color-brand-400)]" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                Recent Collection Execution Runs ({runs.slice(0, 5).length})
              </h3>
            </div>

            {runs.length > 0 ? (
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
                        <td className="p-2.5 font-bold text-[var(--color-text-primary)]">{r.runId.slice(0, 12)}…</td>
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
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] py-3 text-center border border-dashed rounded-xl">
                No collection runs recorded for this source yet.
              </div>
            )}
          </div>

          {/* Report Footer */}
          <div className="pt-4 border-t border-[var(--color-border-subtle)] flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)]">
            <div>Organization Data Platform (ODP) • AI Collection Engine</div>
            <div>Confidential & Proprietary • Page 1 of 1</div>
          </div>
        </div>
      </div>
    </div>
  );
};
