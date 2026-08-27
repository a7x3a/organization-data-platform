import React, { useState, useMemo } from 'react';
import { Source } from '@odp/shared-types';
import { useCollectors } from '../hooks/useCollectors';
import { useRuns } from '../hooks/useRuns';
import { useFiles } from '../hooks/useFiles';
import { useAuth } from '../hooks/useAuth';
import { Button } from './Button';
import { formatBytes } from '../lib/utils';
import { printSourceReportDocument, SourceReportData } from '../lib/generateSourceDoc';
import {
  Printer,
  X,
  FileText,
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
  const { user } = useAuth();
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

  const userName = user?.name || user?.username || 'System Administrator';

  // Compute stats
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

  const sourceStats = sourcesToReport.map((data) => {
    const { source: s, collectors: cList, runs: rList, files: fList } = data;

    let totalPdfCount = 0;
    let digitalPdfCount = 0;
    let ocrPdfCount = 0;
    const extCounts: Record<string, number> = {};
    const subdomainsMap: Record<string, number> = {};
    const pathSectionsMap: Record<string, number> = {};
    let totalSize = 0;

    fList.forEach((f) => {
      const ext = f.extension?.toLowerCase().replace('.', '') || 'other';
      extCounts[ext] = (extCounts[ext] || 0) + 1;
      totalSize += Number(f.fileSize) || 0;

      const isPdf = ext === 'pdf' || (f.mimeType || '').includes('pdf') || (f.r2Key || '').includes('.pdf');
      if (isPdf) {
        totalPdfCount++;
        const key = (f.r2Key || '').toLowerCase();
        const meta = (f.metadata as Record<string, any>) || {};
        const isOcr =
          key.includes('/ocr/') ||
          key.includes('/pdf/ocr/') ||
          meta.ocr === true ||
          meta.pdf_type === 'ocr' ||
          meta.is_scanned === true;

        if (isOcr) {
          ocrPdfCount++;
        } else {
          digitalPdfCount++;
        }
      }

      if (f.sourceUrl) {
        try {
          const u = new URL(f.sourceUrl);
          const host = u.hostname.toLowerCase();
          subdomainsMap[host] = (subdomainsMap[host] || 0) + 1;

          const paths = u.pathname.split('/').filter(Boolean);
          if (paths.length > 0) {
            const topPath = `/${paths[0]}`;
            pathSectionsMap[topPath] = (pathSectionsMap[topPath] || 0) + 1;
          }
        } catch {
          // ignore
        }
      }
    });

    const digitalPct = totalPdfCount > 0 ? Math.round((digitalPdfCount / totalPdfCount) * 100) : 0;
    const ocrPct = totalPdfCount > 0 ? Math.round((ocrPdfCount / totalPdfCount) * 100) : 0;
    const subdomains = Object.entries(subdomainsMap).sort((a, b) => b[1] - a[1]);
    const pathSections = Object.entries(pathSectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return {
      source: s,
      collectors: cList,
      runs: rList,
      files: fList,
      totalFiles: fList.length,
      totalSize,
      totalPdfCount,
      digitalPdfCount,
      ocrPdfCount,
      digitalPct,
      ocrPct,
      extCounts,
      subdomains,
      pathSections,
    };
  });

  const grandTotalFiles = sourceStats.reduce((acc, s) => acc + s.totalFiles, 0);
  const grandTotalSize = sourceStats.reduce((acc, s) => acc + s.totalSize, 0);
  const grandTotalPdfs = sourceStats.reduce((acc, s) => acc + s.totalPdfCount, 0);
  const grandDigitalPdfs = sourceStats.reduce((acc, s) => acc + s.digitalPdfCount, 0);
  const grandOcrPdfs = sourceStats.reduce((acc, s) => acc + s.ocrPdfCount, 0);
  const grandDigitalPct = grandTotalPdfs > 0 ? Math.round((grandDigitalPdfs / grandTotalPdfs) * 100) : 0;
  const grandOcrPct = grandTotalPdfs > 0 ? Math.round((grandOcrPdfs / grandTotalPdfs) * 100) : 0;

  const reportCode =
    activeTab === 'all'
      ? 'QAI-AUD-ALL'
      : `QAI-AUD-SRC-${currentSource?.slug.toUpperCase() || 'TARGET'}`;

  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    printSourceReportDocument({
      title: activeTab === 'all' ? 'Platform Sources & Data Dossier' : `Audit — ${currentSource?.name || 'Report'}`,
      reportCode,
      sourcesData: sourcesToReport,
      isCombined: activeTab === 'all',
      userName,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs font-sans select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl h-[92vh] flex flex-col bg-[#0b1329] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Control Bar */}
        <div className="shrink-0 h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-[#0f172a] text-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Official A4 Ingestion Report
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {allSources.length > 1 && (
              <div className="flex items-center rounded-lg border border-slate-700 p-0.5 bg-slate-900 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer font-semibold ${
                    activeTab === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Sources ({allSources.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('single')}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer font-semibold ${
                    activeTab === 'single' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Single Source
                </button>
              </div>
            )}

            {activeTab === 'single' && allSources.length > 1 && (
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="text-xs h-8 py-1 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none max-w-[160px] truncate"
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
              onClick={handlePrint}
              className="gap-1.5 font-bold text-xs h-8 px-3.5 bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-md cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4 Report</span>
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Realistic Physical A4 Sheet Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#080c14] flex justify-center select-text">
          <div className="w-full max-w-[210mm] bg-white text-[#0f172a] p-6 sm:p-10 shadow-2xl border border-slate-300 font-sans text-xs leading-normal">
            
            {/* 1. Header: [Logo - Platform Name - User] */}
            <div className="flex items-center justify-between border-b-2 border-[#0f172a] pb-2.5 mb-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/qai.webp"
                  alt="QAI Logo"
                  width={36}
                  height={36}
                  className="w-9 h-9 object-contain shrink-0"
                />
                <div>
                  <h1 className="text-sm font-extrabold text-[#0f172a] uppercase tracking-wide leading-none">
                    QAI Organization Data Platform
                  </h1>
                  <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                    Enterprise Raw Data Ingestion &amp; Content Audit Dossier
                  </div>
                </div>
              </div>

              <div className="text-right font-mono text-[9px] text-slate-600 leading-tight">
                <div><strong>User / Operator:</strong> {userName}</div>
                <div><strong>Date:</strong> {reportDate}</div>
                <div><strong>Ref:</strong> {reportCode}</div>
              </div>
            </div>

            {/* 2. Main Source Targets & Data Volume Breakdown Table */}
            <div className="text-[10px] font-bold uppercase tracking-wide bg-slate-100 border-l-3 border-[#0f172a] px-2 py-1 mb-1.5">
              1.0 Source Targets &amp; Data Volume Breakdown
            </div>

            <table className="w-full text-left text-[9px] border border-slate-300 mb-3 border-collapse">
              <thead className="bg-slate-50 font-mono text-[8px] uppercase border-b border-slate-300">
                <tr>
                  <th className="p-1.5 border border-slate-300">Source Name &amp; URL</th>
                  <th className="p-1.5 border border-slate-300 text-right">Downloaded Data</th>
                  <th className="p-1.5 border border-slate-300">Data Types</th>
                  <th className="p-1.5 border border-slate-300">PDF Breakdown (Digital vs OCR)</th>
                  <th className="p-1.5 border border-slate-300">Discovered Hosts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sourceStats.map((s, idx) => {
                  const extSummaries = Object.entries(s.extCounts)
                    .map(([ext, cnt]) => `.${ext}: ${cnt}`)
                    .slice(0, 3)
                    .join(', ');

                  return (
                    <tr key={s.source.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-1.5 border border-slate-200">
                        <div className="font-bold">{s.source.name}</div>
                        <div className="font-mono text-blue-600 text-[8.5px] truncate max-w-[180px]">
                          {s.source.baseUrl}
                        </div>
                      </td>
                      <td className="p-1.5 border border-slate-200 text-right font-mono">
                        <div className="font-bold">{s.totalFiles.toLocaleString()} items</div>
                        <div className="text-slate-500 text-[8px]">{formatBytes(s.totalSize)}</div>
                      </td>
                      <td className="p-1.5 border border-slate-200 font-mono text-[8px]">
                        {extSummaries || '—'}
                      </td>
                      <td className="p-1.5 border border-slate-200">
                        {s.totalPdfCount > 0 ? (
                          <div className="space-y-0.5">
                            <div className="font-mono font-bold text-[8.5px]">
                              {s.totalPdfCount} PDFs
                            </div>
                            <div className="flex gap-1 text-[7.5px] font-mono font-bold">
                              <span className="px-1 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                                Digital: {s.digitalPdfCount} ({s.digitalPct}%)
                              </span>
                              <span className="px-1 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded">
                                OCR: {s.ocrPdfCount} ({s.ocrPct}%)
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[8px]">0 PDFs</span>
                        )}
                      </td>
                      <td className="p-1.5 border border-slate-200 font-mono text-[8px]">
                        {s.subdomains.length} hosts
                      </td>
                    </tr>
                  );
                })}

                {sourceStats.length > 1 && (
                  <tr className="bg-slate-100 font-bold border-t-2 border-[#0f172a]">
                    <td className="p-1.5 border border-slate-300">TOTAL PLATFORM DATA</td>
                    <td className="p-1.5 border border-slate-300 text-right font-mono font-bold">
                      {grandTotalFiles.toLocaleString()} items<br />
                      <span className="text-slate-500 text-[8px]">{formatBytes(grandTotalSize)}</span>
                    </td>
                    <td className="p-1.5 border border-slate-300 font-mono text-[8px]">All Targets</td>
                    <td className="p-1.5 border border-slate-300">
                      <div className="font-mono font-bold text-[8.5px]">{grandTotalPdfs} Total PDFs</div>
                      <div className="flex gap-1 text-[7.5px] font-mono font-bold mt-0.5">
                        <span className="px-1 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                          Digital: {grandDigitalPdfs} ({grandDigitalPct}%)
                        </span>
                        <span className="px-1 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded">
                          OCR: {grandOcrPdfs} ({grandOcrPct}%)
                        </span>
                      </div>
                    </td>
                    <td className="p-1.5 border border-slate-300 font-mono text-[8px]">
                      {sourceStats.reduce((acc, s) => acc + s.subdomains.length, 0)} Hosts
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* 3. Discovered Subdomains & Website Links Sections */}
            <div className="text-[10px] font-bold uppercase tracking-wide bg-slate-100 border-l-3 border-[#0f172a] px-2 py-1 mb-1.5">
              2.0 Discovered Website Taxonomy, Subdomains &amp; Links
            </div>

            {sourceStats.map((s, idx) => (
              <div key={s.source.id} className="mb-3">
                <div className="flex justify-between items-baseline mb-1 border-b border-slate-200 pb-0.5">
                  <div className="font-bold text-[9px]">
                    TARGET {idx + 1}: {s.source.name} &bull; <span className="font-mono text-blue-600">{s.source.baseUrl}</span>
                  </div>
                  <div className="font-mono text-[8px] text-slate-500">
                    Partition: 00_raw/web/{s.source.slug}/ &bull; {s.totalFiles} items
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-1.5">
                  {/* Subdomains */}
                  <div className="border border-slate-300 p-2 bg-white">
                    <div className="text-[8px] font-bold uppercase text-slate-600 mb-1 border-b border-slate-100 pb-0.5">
                      Discovered Subdomains ({s.subdomains.length})
                    </div>
                    {s.subdomains.length > 0 ? (
                      <table className="w-full text-left text-[8.5px] font-mono">
                        <tbody>
                          {s.subdomains.slice(0, 5).map(([host, count]) => (
                            <tr key={host} className="border-b border-slate-100">
                              <td className="py-0.5 truncate max-w-[140px] font-bold">{host}</td>
                              <td className="py-0.5 text-right text-blue-600">{count} URLs</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-slate-400 text-[8px] italic">No separate subdomains.</div>
                    )}
                  </div>

                  {/* Website Paths & Categories */}
                  <div className="border border-slate-300 p-2 bg-white">
                    <div className="text-[8px] font-bold uppercase text-slate-600 mb-1 border-b border-slate-100 pb-0.5">
                      Discovered Website Categories &amp; Endpoints
                    </div>
                    {s.pathSections.length > 0 ? (
                      <table className="w-full text-left text-[8.5px] font-mono">
                        <tbody>
                          {s.pathSections.slice(0, 5).map(([sec, count]) => (
                            <tr key={sec} className="border-b border-slate-100">
                              <td className="py-0.5 text-teal-700 font-bold">{sec}</td>
                              <td className="py-0.5 text-right text-slate-600">{count} items</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-slate-400 text-[8px] italic">No distinct path categories.</div>
                    )}
                  </div>
                </div>

                {/* Formats */}
                <div className="flex items-center gap-1 text-[8px] font-mono text-slate-600">
                  <span className="font-bold">Formats:</span>
                  {Object.entries(s.extCounts).map(([ext, count]) => (
                    <span key={ext} className="px-1 py-0.2 bg-slate-100 border border-slate-200 rounded">
                      .{ext.toUpperCase()}: {count}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {/* Footer */}
            <div className="border-t border-slate-300 pt-1.5 mt-3 flex justify-between text-[8px] font-mono text-slate-400">
              <div>Organization Data Platform (ODP) &bull; Official A4 Ingestion Dossier</div>
              <div>Confidential Document &bull; Generated for {userName}</div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
