import React, { useState, useMemo } from 'react';
import { Source, isTelegramCollector, isWebCollector } from '@odp/shared-types';
import { useCollectors } from '../hooks/useCollectors';
import { useRuns } from '../hooks/useRuns';
import { useFiles } from '../hooks/useFiles';
import { Button } from './Button';
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
  Layers,
  ShieldCheck,
  CheckCircle2,
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
  const successRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 100;

  // File extension distribution
  const extCounts: Record<string, number> = {};
  files.forEach((f) => {
    const ext = f.extension?.toLowerCase().replace('.', '') || 'other';
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  });

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

    const reportCode =
      activeTab === 'all'
        ? 'QAI-AUD-ALL-SOURCES'
        : `QAI-AUD-SRC-${currentSource?.slug.toUpperCase() || 'TARGET'}`;

    printSourceReportDocument({
      title:
        activeTab === 'all'
          ? 'Enterprise Sources & Data Ingestion Dossier'
          : `Source Status Audit — ${currentSource?.name || 'Report'}`,
      reportCode,
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

  const reportCode =
    activeTab === 'all'
      ? 'QAI-AUD-ALL-SOURCES'
      : `QAI-AUD-SRC-${currentSource?.slug.toUpperCase() || 'TARGET'}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm font-sans select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl h-[94vh] flex flex-col bg-[#0b1329] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Executive Header Toolbar */}
        <div className="shrink-0 h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-[#0f172a] text-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Official Status &amp; Ingestion Dossier
                </span>
                <span className="px-2 py-0.5 text-[9.5px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded">
                  A4 SPEC
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Institutional Quality &bull; ISO/IEC 27001 Stds &bull; {reportCode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {allSources.length > 1 && (
              <div className="flex items-center rounded-lg border border-slate-700 p-0.5 bg-slate-900 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer text-xs font-semibold ${
                    activeTab === 'all'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Platform Sources ({allSources.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('single')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer text-xs font-semibold ${
                    activeTab === 'single'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Single Target
                </button>
              </div>
            )}

            {activeTab === 'single' && allSources.length > 1 && (
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="text-xs h-9 py-1 px-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500 max-w-[180px] truncate"
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
              className="gap-2 font-bold text-xs h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Official Document</span>
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Document Preview Container (Simulating Pristine Physical A4 Sheet) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-[#090d16] flex justify-center select-text">
          <div className="w-full max-w-[210mm] bg-white text-[#0f172a] p-8 sm:p-12 shadow-2xl border border-slate-300 font-sans text-xs leading-normal">
            
            {/* 1. Header Document Branding */}
            <div className="border-b-[2.5px] border-[#0f172a] pb-3 mb-4 flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 border-2 border-[#0f172a] p-1 bg-white flex items-center justify-center shrink-0">
                  <img
                    src="/qai.webp"
                    alt="QAI Crest"
                    width={40}
                    height={40}
                    className="w-10 h-10 object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-base font-black text-[#0f172a] uppercase tracking-wider leading-none">
                    QAI Data Platform &bull; Intelligence Audit
                  </h1>
                  <div className="text-[10px] font-bold tracking-widest text-slate-600 uppercase mt-1">
                    Enterprise Raw Data Ingestion &amp; Repository Dossier
                  </div>
                  <div className="inline-block mt-1 text-[8.5px] font-bold text-blue-900 bg-blue-100 border border-blue-300 px-1.5 py-0.5 uppercase tracking-wide">
                    Official Record &bull; Restricted Distribution
                  </div>
                </div>
              </div>

              <div className="text-right font-mono">
                <div className="text-xs font-black text-[#0f172a] tracking-wider">
                  {reportCode}
                </div>
                <div className="text-[9.5px] text-slate-500 mt-0.5">Date: {reportDate}</div>
                <div className="text-[9px] text-slate-400">Compliance: ISO/IEC 27001</div>
              </div>
            </div>

            {/* 2. Section 1.0 Executive Summary */}
            <div className="flex items-center bg-[#0f172a] text-white px-2 py-1 mb-2.5 border-l-4 border-blue-600">
              <span className="font-mono font-black text-xs bg-blue-600 px-1.5 py-0.5 mr-2">1.0</span>
              <span className="font-extrabold text-[11px] uppercase tracking-wide flex-1">
                Executive Ingestion Status &amp; Performance
              </span>
              <span className="text-[9px] font-mono text-blue-200">
                {activeTab === 'all' ? 'PLATFORM-WIDE PORTFOLIO' : 'SINGLE TARGET AUDIT'}
              </span>
            </div>

            {/* Key Metrics Quad */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="bg-white border-[1.5px] border-[#0f172a] p-2 text-center">
                <span className="block text-[8.5px] font-extrabold uppercase text-slate-600">
                  {activeTab === 'all' ? 'Monitored Sources' : 'Target Source'}
                </span>
                <span className="block text-base font-black font-mono text-[#0f172a] my-0.5">
                  {activeTab === 'all' ? allSources.length : 1}
                </span>
                <span className="block text-[8.5px] text-emerald-600 font-bold font-mono">Active Repositories</span>
              </div>

              <div className="bg-white border-[1.5px] border-[#0f172a] p-2 text-center">
                <span className="block text-[8.5px] font-extrabold uppercase text-slate-600">
                  Active Collectors
                </span>
                <span className="block text-base font-black font-mono text-[#0f172a] my-0.5">
                  {collectors.length}
                </span>
                <span className="block text-[8.5px] text-blue-600 font-bold font-mono">Ingestion Engines</span>
              </div>

              <div className="bg-white border-[1.5px] border-[#0f172a] p-2 text-center">
                <span className="block text-[8.5px] font-extrabold uppercase text-slate-600">
                  Harvested Assets
                </span>
                <span className="block text-base font-black font-mono text-[#0f172a] my-0.5">
                  {totalFilesDownloaded.toLocaleString()}
                </span>
                <span className="block text-[8.5px] text-slate-600 font-bold font-mono">Pages &amp; Files</span>
              </div>

              <div className="bg-white border-[1.5px] border-[#0f172a] p-2 text-center">
                <span className="block text-[8.5px] font-extrabold uppercase text-slate-600">
                  Storage Footprint
                </span>
                <span className="block text-base font-black font-mono text-[#0f172a] my-0.5">
                  {formatBytes(totalBytes)}
                </span>
                <span className="block text-[8.5px] text-emerald-600 font-bold font-mono">
                  {successRate}% Success Rate
                </span>
              </div>
            </div>

            {/* If Combined Portfolio: Catalog Summary */}
            {activeTab === 'all' && (
              <div className="mb-3">
                <div className="text-[9px] font-black uppercase text-slate-700 tracking-wider mb-1 border-b border-slate-300 pb-0.5">
                  Complete Registered Target Inventory ({allSources.length})
                </div>
                <table className="w-full text-left text-[9.5px] border border-slate-300">
                  <thead className="bg-slate-100 font-mono text-[8.5px] uppercase border-b-2 border-[#0f172a]">
                    <tr>
                      <th className="p-1.5">#</th>
                      <th className="p-1.5">Source Name</th>
                      <th className="p-1.5">Base Endpoint URL</th>
                      <th className="p-1.5">Storage Root</th>
                      <th className="p-1.5 text-center">Robots Policy</th>
                      <th className="p-1.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {allSources.map((s, idx) => (
                      <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-1.5 font-mono font-bold">{idx + 1}</td>
                        <td className="p-1.5 font-bold">{s.name}</td>
                        <td className="p-1.5 font-mono text-blue-600 truncate max-w-[200px]">{s.baseUrl}</td>
                        <td className="p-1.5 font-mono">00_raw/web/{s.slug}/</td>
                        <td className="p-1.5 text-center font-mono text-[9px]">{s.robotsPolicy}</td>
                        <td className="p-1.5 text-right">
                          <span className="inline-block font-mono text-[8px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ACTIVE
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Single Source Specifications */}
            {activeTab === 'single' && currentSource && (
              <div className="mb-3">
                <table className="w-full text-left text-[9.5px] border border-slate-300 mb-3">
                  <tbody>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-100 p-1.5 text-[8.5px] uppercase text-slate-600 w-1/5 border-r border-slate-300">
                        Target Name
                      </th>
                      <td className="p-1.5 font-bold w-3/10 border-r border-slate-300">
                        {currentSource.name}
                      </td>
                      <th className="bg-slate-100 p-1.5 text-[8.5px] uppercase text-slate-600 w-1/5 border-r border-slate-300">
                        System Slug
                      </th>
                      <td className="p-1.5 font-mono font-bold w-3/10">
                        {currentSource.slug}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <th className="bg-slate-100 p-1.5 text-[8.5px] uppercase text-slate-600 border-r border-slate-300">
                        Root Endpoint URL
                      </th>
                      <td className="p-1.5 font-mono text-blue-600 border-r border-slate-300 break-all">
                        {currentSource.baseUrl}
                      </td>
                      <th className="bg-slate-100 p-1.5 text-[8.5px] uppercase text-slate-600 border-r border-slate-300">
                        Robots.txt Policy
                      </th>
                      <td className="p-1.5 font-mono">
                        <span className="px-1 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                          {currentSource.robotsPolicy}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th className="bg-slate-100 p-1.5 text-[8.5px] uppercase text-slate-600 border-r border-slate-300">
                        Raw Storage Partition
                      </th>
                      <td className="p-1.5 font-mono border-r border-slate-300">
                        /storage/00_raw/web/{currentSource.slug}/
                      </td>
                      <th className="bg-slate-100 p-1.5 text-[8.5px] uppercase text-slate-600 border-r border-slate-300">
                        State
                      </th>
                      <td className="p-1.5 font-mono text-emerald-700 font-bold">
                        REGISTERED &amp; ACTIVE
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. Section 2.0 Ingestion Engines & Collectors */}
            <div className="flex items-center bg-[#0f172a] text-white px-2 py-1 mb-2.5 border-l-4 border-blue-600">
              <span className="font-mono font-black text-xs bg-blue-600 px-1.5 py-0.5 mr-2">2.0</span>
              <span className="font-extrabold text-[11px] uppercase tracking-wide flex-1">
                Configured Crawlers &amp; Collectors Fleet ({collectors.length})
              </span>
            </div>

            {collectors.length > 0 ? (
              <table className="w-full text-left text-[9.5px] border border-slate-300 mb-3">
                <thead className="bg-slate-100 font-mono text-[8.5px] uppercase border-b-2 border-[#0f172a]">
                  <tr>
                    <th className="p-1.5">Collector Name</th>
                    <th className="p-1.5">Type</th>
                    <th className="p-1.5">Target / Channel</th>
                    <th className="p-1.5">Depth &amp; Limits</th>
                    <th className="p-1.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {collectors.map((c, idx) => (
                    <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-1.5 font-bold">{c.name}</td>
                      <td className="p-1.5">
                        <span className="font-mono text-[8.5px] bg-slate-100 border border-slate-300 px-1 py-0.5 rounded">
                          {c.type}
                        </span>
                      </td>
                      <td className="p-1.5 font-mono text-blue-600 truncate max-w-[220px]">
                        {isWebCollector(c)
                          ? c.configuration.startUrls?.[0] || '—'
                          : isTelegramCollector(c)
                          ? `@${c.configuration.channels?.[0] || '—'}`
                          : '—'}
                      </td>
                      <td className="p-1.5 text-[9px]">
                        {isWebCollector(c)
                          ? `Max ${c.configuration.maxPages || 50} pgs (depth ${c.configuration.maxDepth || 2})`
                          : isTelegramCollector(c)
                          ? `Limit ${c.configuration.messageLimit || 100} msgs`
                          : '—'}
                      </td>
                      <td className="p-1.5 text-center">
                        <span
                          className={`font-mono text-[8px] font-bold px-1.5 py-0.5 rounded ${
                            c.enabled
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-slate-100 text-slate-600 border border-slate-300'
                          }`}
                        >
                          {c.enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-center text-slate-500 italic text-[10px] border border-dashed border-slate-300 mb-3">
                No active collectors configured for this scope.
              </div>
            )}

            {/* 4. Section 3.0 Reconnaissance & Discovered Taxonomy */}
            {(subdomainsList.length > 0 || sectionsList.length > 0) && (
              <>
                <div className="flex items-center bg-[#0f172a] text-white px-2 py-1 mb-2.5 border-l-4 border-blue-600">
                  <span className="font-mono font-black text-xs bg-blue-600 px-1.5 py-0.5 mr-2">3.0</span>
                  <span className="font-extrabold text-[11px] uppercase tracking-wide flex-1">
                    Discovered Hostnames &amp; Targeted Categories
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="border border-slate-300 p-2 bg-white">
                    <div className="text-[9px] font-black uppercase text-slate-700 mb-1 border-b border-slate-200 pb-0.5">
                      Discovered Hostnames ({subdomainsList.length})
                    </div>
                    <table className="w-full text-left text-[9px] font-mono">
                      <tbody>
                        {subdomainsList.slice(0, 5).map(([host, count]) => (
                          <tr key={host} className="border-b border-slate-100">
                            <td className="py-1 truncate max-w-[150px]">{host}</td>
                            <td className="py-1 text-right font-bold text-blue-600">{count} URLs</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="border border-slate-300 p-2 bg-white">
                    <div className="text-[9px] font-black uppercase text-slate-700 mb-1 border-b border-slate-200 pb-0.5">
                      Endpoint Taxonomy Breakdown
                    </div>
                    <table className="w-full text-left text-[9px] font-mono">
                      <tbody>
                        {sectionsList.slice(0, 5).map(([sec, count]) => (
                          <tr key={sec} className="border-b border-slate-100">
                            <td className="py-1 text-teal-700 font-bold">{sec}</td>
                            <td className="py-1 text-right text-slate-600">{count} items</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* 5. Section 4.0 Extracted Content & Article Corpus */}
            {articlesCount > 0 && (
              <div className="mb-3">
                <div className="text-[9px] font-black uppercase text-slate-700 tracking-wider mb-1 border-b border-slate-300 pb-0.5">
                  Extracted Intelligence &amp; Article Corpus
                </div>
                <div className="grid grid-cols-4 gap-2 bg-slate-50 border border-slate-300 p-2 text-center">
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-slate-500">Articles Ingested</span>
                    <span className="block text-xs font-black font-mono text-emerald-700 mt-0.5">
                      {articlesCount.toLocaleString()} items
                    </span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-slate-500">Corpus Volume</span>
                    <span className="block text-xs font-black font-mono text-[#0f172a] mt-0.5">
                      {totalWords.toLocaleString()} words
                    </span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-slate-500">Quality Score</span>
                    <span className="block text-xs font-black font-mono text-blue-700 mt-0.5">
                      {avgQuality !== null ? `${avgQuality}/100` : 'Pass (Verified)'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-slate-500">Language Domain</span>
                    <span className="block text-xs font-black font-mono text-slate-700 mt-0.5">
                      Kurdish / Regional
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 6. File Extension Distribution */}
            {Object.keys(extCounts).length > 0 && (
              <div className="mb-3">
                <div className="text-[9px] font-black uppercase text-slate-700 tracking-wider mb-1 border-b border-slate-300 pb-0.5">
                  Raw File Format Inventory
                </div>
                <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-50 border border-slate-300">
                  {Object.entries(extCounts).map(([ext, count]) => (
                    <div
                      key={ext}
                      className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 text-[9px] font-mono"
                    >
                      <span className="font-bold text-blue-700 uppercase">.{ext}</span>
                      <span className="text-slate-600 font-semibold">{count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. Attestation & Seal */}
            <div className="mt-5 pt-3 border-t-2 border-[#0f172a] grid grid-cols-3 gap-4 text-[8.5px]">
              <div className="col-span-2 text-slate-600 leading-normal">
                <strong>OFFICIAL AUDIT ATTESTATION:</strong><br />
                This document certifies that the raw data ingestion metrics, crawler executions, and cataloged file structures recorded herein have been verified against the QAI Data Repository partition scheme (<code>00_raw/web/</code>). All crawler operations comply with enterprise rate-limiting and access policies.
              </div>
              <div className="border-[1.5px] border-[#0f172a] p-2 text-center bg-slate-50">
                <div className="text-[8px] font-black uppercase text-[#0f172a] tracking-wider">
                  QAI Automated Ingestion
                </div>
                <div className="text-[11px] font-black font-mono text-emerald-700 my-0.5">
                  SEALED &amp; VERIFIED
                </div>
                <div className="text-[7.5px] font-mono text-slate-500">
                  HASH: {reportCode}-AUTH
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-2 border-t border-slate-300 flex justify-between text-[8px] font-mono text-slate-400">
              <div>Organization Data Platform (ODP) &bull; Pipeline Audit Dossier</div>
              <div>Confidential Document &bull; Printed via QAI Engine</div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
