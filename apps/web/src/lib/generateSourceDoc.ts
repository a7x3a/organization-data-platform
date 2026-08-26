import { Source, CollectedFile, CollectionRun, Collector, isWebCollector, isTelegramCollector } from '@odp/shared-types';
import { formatBytes } from './utils';

export interface SourceReportData {
  source: Source;
  collectors: Collector[];
  runs: CollectionRun[];
  files: CollectedFile[];
}

export function generateSourceReportHtml(options: {
  title: string;
  reportCode: string;
  sourcesData: SourceReportData[];
  isCombined?: boolean;
}): string {
  const { title, reportCode, sourcesData, isCombined = false } = options;
  const now = new Date().toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  // Calculate platform totals
  const totalSources = sourcesData.length;
  const totalCollectors = sourcesData.reduce((acc, s) => acc + s.collectors.length, 0);
  const totalRuns = sourcesData.reduce((acc, s) => acc + s.runs.length, 0);
  const totalPages = sourcesData.reduce(
    (acc, s) => acc + s.runs.reduce((rAcc, r) => rAcc + (r.pagesCrawled || 0), 0),
    0
  );
  const totalFiles = sourcesData.reduce(
    (acc, s) => acc + s.runs.reduce((rAcc, r) => rAcc + (r.filesDownloaded || 0), 0),
    0
  );
  const totalBytes = sourcesData.reduce(
    (acc, s) => acc + s.files.reduce((fAcc, f) => fAcc + (Number(f.fileSize) || 0), 0),
    0
  );

  const renderSourceSection = (data: SourceReportData, index: number) => {
    const { source, collectors, runs, files } = data;

    // Subdomains & sections extraction
    const subdomainsMap: Record<string, number> = {};
    const sectionsMap: Record<string, number> = {};
    let articlesCount = 0;
    let totalWords = 0;
    let qualityTotal = 0;
    let qualityCount = 0;
    const extCounts: Record<string, number> = {};

    files.forEach((f) => {
      const ext = f.extension?.toLowerCase().replace('.', '') || 'unknown';
      extCounts[ext] = (extCounts[ext] || 0) + 1;

      if (f.sourceUrl) {
        try {
          const u = new URL(f.sourceUrl);
          const hostname = u.hostname.toLowerCase();
          subdomainsMap[hostname] = (subdomainsMap[hostname] || 0) + 1;

          const parts = u.pathname.split('/').filter(Boolean);
          if (parts.length > 0) {
            const sec = `/${parts[0]}`;
            sectionsMap[sec] = (sectionsMap[sec] || 0) + 1;
          }
        } catch {
          // ignore
        }
      }

      const meta = f.metadata as Record<string, any> | undefined;
      if (meta) {
        if (meta.body_text || meta.paragraphs || meta.title) {
          articlesCount++;
          if (meta.word_count) totalWords += Number(meta.word_count) || 0;
        }
        if (meta.quality?.overall_score !== undefined) {
          qualityTotal += Number(meta.quality.overall_score);
          qualityCount++;
        }
      }
    });

    const subdomains = Object.entries(subdomainsMap).sort((a, b) => b[1] - a[1]);
    const sections = Object.entries(sectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const avgQuality = qualityCount > 0 ? Math.round(qualityTotal / qualityCount) : null;
    const sourcePages = runs.reduce((acc, r) => acc + (r.pagesCrawled || 0), 0);
    const sourceDownloaded = runs.reduce((acc, r) => acc + (r.filesDownloaded || 0), 0);
    const sourceBytes = files.reduce((acc, f) => acc + (Number(f.fileSize) || 0), 0);

    return `
      <div class="source-block ${isCombined && index > 0 ? 'page-break' : ''}">
        <!-- Source Header Info -->
        <div class="doc-card section-card">
          <div class="card-header">
            <div>
              <span class="badge badge-primary">SOURCE #${index + 1}</span>
              <h2 class="source-title">${source.name}</h2>
              <div class="source-url">${source.baseUrl}</div>
            </div>
            <div class="text-right">
              <div class="meta-label">Storage Partition</div>
              <div class="meta-code">00_raw/web/${source.slug}/</div>
              <div class="meta-sub">Robots: <strong>${source.robotsPolicy}</strong></div>
            </div>
          </div>

          <!-- Source KPIs -->
          <div class="kpi-grid">
            <div class="kpi-box">
              <div class="kpi-num">${runs.length}</div>
              <div class="kpi-label">Total Runs</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-num">${sourcePages.toLocaleString()}</div>
              <div class="kpi-label">Pages Crawled</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-num">${sourceDownloaded.toLocaleString()}</div>
              <div class="kpi-label">Assets Harvested</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-num">${formatBytes(sourceBytes)}</div>
              <div class="kpi-label">Storage Volume</div>
            </div>
          </div>
        </div>

        <!-- Subdomains & Targeted Sections Grid -->
        ${
          subdomains.length > 0 || sections.length > 0
            ? `
          <div class="grid-2">
            <div class="doc-card">
              <div class="card-sub-header">
                <span class="icon">🌐</span>
                <h3>Discovered Subdomains (${subdomains.length})</h3>
              </div>
              <div class="list-container">
                ${subdomains
                  .map(
                    ([host, count]) => `
                  <div class="list-item">
                    <span class="mono-bold">${host}</span>
                    <span class="pill">${count} URLs</span>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>

            <div class="doc-card">
              <div class="card-sub-header">
                <span class="icon">📁</span>
                <h3>Targeted Sections & Categories</h3>
              </div>
              <div class="list-container">
                ${
                  sections.length > 0
                    ? sections
                        .map(
                          ([sec, count]) => `
                    <div class="list-item">
                      <span class="mono-code">${sec}</span>
                      <span class="pill pill-cyan">${count} items</span>
                    </div>
                  `
                        )
                        .join('')
                    : '<div class="empty-state">No section breakdown recorded.</div>'
                }
              </div>
            </div>
          </div>
        `
            : ''
        }

        <!-- Web Data & Extracted Articles Summary -->
        ${
          articlesCount > 0
            ? `
          <div class="doc-card intelligence-card">
            <div class="card-sub-header text-emerald">
              <span class="icon">📖</span>
              <h3>Harvested Web Articles & Structured Documents</h3>
            </div>
            <div class="kpi-grid">
              <div class="kpi-box">
                <div class="kpi-num text-emerald">${articlesCount.toLocaleString()}</div>
                <div class="kpi-label">Extracted Articles</div>
              </div>
              <div class="kpi-box">
                <div class="kpi-num">${totalWords.toLocaleString()}</div>
                <div class="kpi-label">Total Words</div>
              </div>
              <div class="kpi-box">
                <div class="kpi-num text-cyan">${avgQuality !== null ? `${avgQuality}/100` : '—'}</div>
                <div class="kpi-label">Quality Score</div>
              </div>
              <div class="kpi-box">
                <div class="kpi-num mono-sm">Kurdish / Multilingual</div>
                <div class="kpi-label">Language Class</div>
              </div>
            </div>
          </div>
        `
            : ''
        }

        <!-- Collectors Table -->
        <div class="doc-card">
          <div class="card-sub-header">
            <span class="icon">⚙️</span>
            <h3>Configured Collectors (${collectors.length})</h3>
          </div>
          ${
            collectors.length > 0
              ? `
            <table class="doc-table">
              <thead>
                <tr>
                  <th>Collector Name</th>
                  <th>Type</th>
                  <th>Target / Seed URL</th>
                  <th>Limit / Depth</th>
                  <th class="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                ${collectors
                  .map(
                    (c) => `
                  <tr>
                    <td class="font-bold">${c.name}</td>
                    <td><span class="badge-type">${c.type}</span></td>
                    <td class="mono-truncate">${
                      isWebCollector(c)
                        ? c.configuration.startUrls?.[0] || '—'
                        : isTelegramCollector(c)
                        ? `@${c.configuration.channels?.[0] || '—'}`
                        : '—'
                    }</td>
                    <td>${
                      isWebCollector(c)
                        ? `Max ${c.configuration.maxPages} pages`
                        : isTelegramCollector(c)
                        ? `Limit ${c.configuration.messageLimit} msgs`
                        : '—'
                    }</td>
                    <td class="text-right font-bold ${c.enabled ? 'text-emerald' : 'text-muted'}">
                      ${c.enabled ? 'Enabled' : 'Disabled'}
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          `
              : '<div class="empty-state">No collectors configured.</div>'
          }
        </div>

        <!-- Recent Runs Table -->
        ${
          runs.length > 0
            ? `
          <div class="doc-card">
            <div class="card-sub-header">
              <span class="icon">⏱️</span>
              <h3>Recent Collection Executions (${runs.slice(0, 4).length})</h3>
            </div>
            <table class="doc-table">
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Date</th>
                  <th>Pages Crawled</th>
                  <th>Files Downloaded</th>
                  <th class="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                ${runs
                  .slice(0, 4)
                  .map(
                    (r) => `
                  <tr>
                    <td class="mono-bold">${r.runId}</td>
                    <td>${r.startedAt ? new Date(r.startedAt).toLocaleDateString() : '—'}</td>
                    <td>${r.pagesCrawled ?? 0}</td>
                    <td>${r.filesDownloaded ?? 0}</td>
                    <td class="text-right font-bold ${
                      r.status === 'COMPLETED'
                        ? 'text-emerald'
                        : r.status === 'FAILED'
                        ? 'text-rose'
                        : 'text-amber'
                    }">
                      ${r.status}
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
            : ''
        }
      </div>
    `;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} — QAI Data Collector</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 14mm 14mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background-color: #f8fafc;
      font-size: 11.5px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-container {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px 36px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      border-radius: 8px;
    }
    @media print {
      body {
        background: #ffffff;
      }
      .print-container {
        max-width: 100%;
        margin: 0;
        padding: 0;
        box-shadow: none;
        border-radius: 0;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-before: always;
        break-before: page;
        padding-top: 20px;
      }
    }
    
    /* Top Doc Branding Header */
    .doc-brand-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 2.5px solid #2563eb;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-title span {
      color: #2563eb;
    }
    .brand-sub {
      font-size: 10px;
      color: #64748b;
      font-family: monospace;
      margin-top: 2px;
    }
    .report-meta {
      text-align: right;
    }
    .report-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      font-family: monospace;
      color: #2563eb;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .report-date {
      font-size: 10px;
      color: #64748b;
      font-family: monospace;
      margin-top: 4px;
    }

    /* Cards */
    .doc-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    }
    .section-card {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .intelligence-card {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .card-sub-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #334155;
      margin-bottom: 10px;
    }
    .source-title {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 4px;
    }
    .source-url {
      font-size: 11px;
      color: #2563eb;
      font-family: monospace;
      word-break: break-all;
    }
    .meta-label {
      font-size: 9px;
      text-transform: uppercase;
      font-family: monospace;
      color: #64748b;
    }
    .meta-code {
      font-size: 10.5px;
      font-family: monospace;
      font-weight: 700;
      color: #2563eb;
    }
    .meta-sub {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }

    /* KPIs */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .kpi-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }
    .kpi-num {
      font-size: 16px;
      font-weight: 800;
      font-family: monospace;
      color: #0f172a;
    }
    .kpi-label {
      font-size: 9.5px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      margin-top: 2px;
    }

    /* Grids & Lists */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .list-container {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10.5px;
    }
    .mono-bold {
      font-family: monospace;
      font-weight: 700;
      color: #0f172a;
    }
    .mono-code {
      font-family: monospace;
      font-weight: 600;
      color: #0284c7;
    }
    .mono-truncate {
      font-family: monospace;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pill {
      font-family: monospace;
      font-size: 9.5px;
      font-weight: 700;
      background: #eff6ff;
      color: #2563eb;
      border: 1px solid #bfdbfe;
      padding: 1px 6px;
      border-radius: 12px;
    }
    .pill-cyan {
      background: #f0fdfa;
      color: #0d9488;
      border-color: #99f6e4;
    }

    /* Tables */
    .doc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    .doc-table th {
      background: #f8fafc;
      color: #475569;
      font-family: monospace;
      font-size: 9.5px;
      text-transform: uppercase;
      font-weight: 700;
      padding: 6px 8px;
      border-bottom: 1.5px solid #cbd5e1;
      text-align: left;
    }
    .doc-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
    }
    .doc-table tbody tr:nth-child(even) {
      background: #fcfdfe;
    }

    /* Badges & Highlights */
    .badge {
      display: inline-block;
      font-size: 9px;
      font-family: monospace;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .badge-primary {
      background: #2563eb;
      color: #ffffff;
    }
    .badge-type {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      font-family: monospace;
      font-size: 9.5px;
      padding: 1px 5px;
      border-radius: 4px;
    }
    .text-emerald { color: #059669; }
    .text-cyan { color: #0284c7; }
    .text-rose { color: #e11d48; }
    .text-amber { color: #d97706; }
    .text-muted { color: #94a3b8; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .empty-state {
      text-align: center;
      padding: 10px;
      color: #94a3b8;
      font-style: italic;
    }

    /* Footer */
    .doc-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 10px;
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #64748b;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="print-container">
    <!-- Top Branding Header -->
    <div class="doc-brand-header">
      <div>
        <div class="brand-title">
          QAI <span>Data Collector</span>
        </div>
        <div class="brand-sub">Enterprise Raw Data Ingestion & Intelligence Platform</div>
      </div>
      <div class="report-meta">
        <div class="report-badge">${reportCode}</div>
        <div class="report-date">${now}</div>
      </div>
    </div>

    ${
      isCombined
        ? `
      <!-- Combined Portfolio Executive Summary -->
      <div class="doc-card section-card">
        <div class="card-header">
          <div>
            <span class="badge badge-primary">PORTFOLIO EXECUTIVE OVERVIEW</span>
            <h2 class="source-title">Enterprise Sources & Data Collection Portfolio</h2>
          </div>
          <div class="text-right">
            <div class="meta-label">Total Sources</div>
            <div class="meta-code">${totalSources} Cataloged</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-num">${totalSources}</div>
            <div class="kpi-label">Data Sources</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-num">${totalCollectors}</div>
            <div class="kpi-label">Active Collectors</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-num">${totalPages.toLocaleString()}</div>
            <div class="kpi-label">Pages Crawled</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-num">${totalFiles.toLocaleString()}</div>
            <div class="kpi-label">Assets Harvested</div>
          </div>
        </div>
      </div>
    `
        : ''
    }

    <!-- Source Sections -->
    ${sourcesData.map((d, i) => renderSourceSection(d, i)).join('')}

    <!-- Footer -->
    <div class="doc-footer">
      <div>Organization Data Platform (ODP) • Automated Pipeline Audit</div>
      <div>Confidential & Proprietary • Document Generated via QAI Platform</div>
    </div>
  </div>
</body>
</html>
  `;
}

export function printSourceReportDocument(options: {
  title: string;
  reportCode: string;
  sourcesData: SourceReportData[];
  isCombined?: boolean;
}): void {
  const html = generateSourceReportHtml(options);
  const printWindow = window.open('', '_blank', 'width=900,height=950');
  if (!printWindow) {
    alert('Please allow popups to open the formatted printable document.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };
}
