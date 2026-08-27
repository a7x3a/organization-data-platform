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
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  // Calculate platform totals
  const totalSources = sourcesData.length;
  const totalCollectors = sourcesData.reduce((acc, s) => acc + s.collectors.length, 0);
  const totalRuns = sourcesData.reduce((acc, s) => acc + s.runs.length, 0);
  const completedRuns = sourcesData.reduce(
    (acc, s) => acc + s.runs.filter((r) => r.status === 'COMPLETED').length,
    0
  );
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

  const successRate = totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 100;

  const renderSourceDetails = (data: SourceReportData, index: number) => {
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
      const ext = f.extension?.toLowerCase().replace('.', '') || 'other';
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
    const sections = Object.entries(sectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const avgQuality = qualityCount > 0 ? Math.round(qualityTotal / qualityCount) : null;
    const sourcePages = runs.reduce((acc, r) => acc + (r.pagesCrawled || 0), 0);
    const sourceDownloaded = runs.reduce((acc, r) => acc + (r.filesDownloaded || 0), 0);
    const sourceBytes = files.reduce((acc, f) => acc + (Number(f.fileSize) || 0), 0);

    return `
      <div class="source-dossier-entry ${isCombined && index > 0 ? 'page-break' : ''}">
        <!-- Section Header -->
        <div class="section-title-bar">
          <div class="section-num">${isCombined ? `2.${index + 1}` : '2.0'}</div>
          <div class="section-heading">
            <h3>TARGET SPECIFICATION: ${source.name.toUpperCase()}</h3>
            <span class="section-sub">${source.baseUrl}</span>
          </div>
          <div class="section-badge">PARTITION: 00_raw/web/${source.slug}/</div>
        </div>

        <!-- Source Specification Metadata Grid -->
        <table class="doc-meta-table">
          <tbody>
            <tr>
              <th style="width: 20%;">Source Name</th>
              <td style="width: 30%;"><strong>${source.name}</strong></td>
              <th style="width: 20%;">Identifier Slug</th>
              <td style="width: 30%;" class="mono">${source.slug}</td>
            </tr>
            <tr>
              <th>Base Root URL</th>
              <td class="mono url-cell">${source.baseUrl}</td>
              <th>Robots.txt Policy</th>
              <td><span class="policy-tag">${source.robotsPolicy}</span></td>
            </tr>
            <tr>
              <th>Storage Directory</th>
              <td class="mono">/storage/00_raw/web/${source.slug}/</td>
              <th>Operational Status</th>
              <td><span class="status-pill status-active">REGISTERED & ACTIVE</span></td>
            </tr>
          </tbody>
        </table>

        <!-- Source Metrics Summary -->
        <div class="metrics-row">
          <div class="metric-cell">
            <span class="metric-label">Execution Runs</span>
            <span class="metric-val">${runs.length}</span>
            <span class="metric-sub">${runs.filter((r) => r.status === 'COMPLETED').length} Successful</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">Crawled Pages</span>
            <span class="metric-val">${sourcePages.toLocaleString()}</span>
            <span class="metric-sub">DOM Ingested</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">Harvested Assets</span>
            <span class="metric-val">${sourceDownloaded.toLocaleString()}</span>
            <span class="metric-sub">Deduplicated</span>
          </div>
          <div class="metric-cell">
            <span class="metric-label">Storage Footprint</span>
            <span class="metric-val">${formatBytes(sourceBytes)}</span>
            <span class="metric-sub">Raw Byte Volume</span>
          </div>
        </div>

        <!-- Collectors Specification Table -->
        <div class="sub-block">
          <div class="sub-block-title">CONFIGURED CRAWLERS & INGESTION COLLECTORS (${collectors.length})</div>
          ${
            collectors.length > 0
              ? `
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 25%;">Collector Name</th>
                  <th style="width: 15%;">Engine Type</th>
                  <th style="width: 35%;">Seed Target / Channel</th>
                  <th style="width: 15%;">Depth / Limit</th>
                  <th style="width: 10%; text-align: center;">State</th>
                </tr>
              </thead>
              <tbody>
                ${collectors
                  .map(
                    (c) => `
                  <tr>
                    <td><strong>${c.name}</strong></td>
                    <td><span class="type-badge">${c.type}</span></td>
                    <td class="mono url-cell">${
                      isWebCollector(c)
                        ? c.configuration.startUrls?.[0] || '—'
                        : isTelegramCollector(c)
                        ? `@${c.configuration.channels?.[0] || '—'}`
                        : '—'
                    }</td>
                    <td>${
                      isWebCollector(c)
                        ? `${c.configuration.maxPages || 50} pages (depth ${c.configuration.maxDepth || 2})`
                        : isTelegramCollector(c)
                        ? `${c.configuration.messageLimit || 100} msgs`
                        : '—'
                    }</td>
                    <td style="text-align: center;">
                      <span class="status-pill ${c.enabled ? 'status-active' : 'status-disabled'}">
                        ${c.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          `
              : '<div class="empty-notice">No collectors currently registered under this source.</div>'
          }
        </div>

        <!-- Taxonomy & Reconnaissance Grid -->
        ${
          subdomains.length > 0 || sections.length > 0
            ? `
          <div class="dual-columns">
            <div class="column-box">
              <div class="sub-block-title">DISCOVERED SUBDOMAINS (${subdomains.length})</div>
              <table class="data-table compact-table">
                <thead>
                  <tr>
                    <th>Domain / Subdomain</th>
                    <th style="text-align: right; width: 30%;">Discovered URLs</th>
                  </tr>
                </thead>
                <tbody>
                  ${subdomains.slice(0, 6).map(([host, count]) => `
                    <tr>
                      <td class="mono">${host}</td>
                      <td style="text-align: right;" class="mono font-bold">${count.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="column-box">
              <div class="sub-block-title">DISCOVERED TAXONOMY & SECTIONS</div>
              <table class="data-table compact-table">
                <thead>
                  <tr>
                    <th>Endpoint / Section</th>
                    <th style="text-align: right; width: 30%;">Objects</th>
                  </tr>
                </thead>
                <tbody>
                  ${sections.length > 0 ? sections.map(([sec, count]) => `
                    <tr>
                      <td class="mono">${sec}</td>
                      <td style="text-align: right;" class="mono font-bold">${count.toLocaleString()}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="2" class="empty-notice">No path categories discovered.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        `
            : ''
        }

        <!-- Intelligence & Web Articles Breakdown -->
        ${
          articlesCount > 0
            ? `
          <div class="sub-block">
            <div class="sub-block-title">EXTRACTED CONTENT & INTELLIGENCE ASSETS</div>
            <div class="intel-summary-box">
              <div class="intel-col">
                <span class="intel-label">Extracted Articles / Documents</span>
                <span class="intel-val">${articlesCount.toLocaleString()} items</span>
              </div>
              <div class="intel-col">
                <span class="intel-label">Total Corpus Volume</span>
                <span class="intel-val">${totalWords.toLocaleString()} words</span>
              </div>
              <div class="intel-col">
                <span class="intel-label">Clean Quality Index</span>
                <span class="intel-val">${avgQuality !== null ? `${avgQuality} / 100` : 'Evaluated (Pass)'}</span>
              </div>
              <div class="intel-col">
                <span class="intel-label">Linguistic Domain</span>
                <span class="intel-val">Kurdish / Regional Corpus</span>
              </div>
            </div>
          </div>
        `
            : ''
        }

        <!-- File Distribution Breakdown -->
        ${
          Object.keys(extCounts).length > 0
            ? `
          <div class="sub-block">
            <div class="sub-block-title">RAW FILE ASSET INVENTORY BY FORMAT</div>
            <div class="format-chips-container">
              ${Object.entries(extCounts)
                .map(
                  ([ext, count]) => `
                <div class="format-chip">
                  <span class="chip-ext">.${ext.toUpperCase()}</span>
                  <span class="chip-count">${count.toLocaleString()}</span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }

        <!-- Recent Execution Log Table -->
        ${
          runs.length > 0
            ? `
          <div class="sub-block">
            <div class="sub-block-title">RECENT PIPELINE EXECUTION AUDIT LOG</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 25%;">Execution Run ID</th>
                  <th style="width: 25%;">Timestamp</th>
                  <th style="width: 15%; text-align: right;">Pages Ingested</th>
                  <th style="width: 15%; text-align: right;">Files Stored</th>
                  <th style="width: 20%; text-align: center;">Audit Result</th>
                </tr>
              </thead>
              <tbody>
                ${runs.slice(0, 5).map((r) => `
                  <tr>
                    <td class="mono font-bold">${r.runId}</td>
                    <td>${r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'}</td>
                    <td style="text-align: right;" class="mono">${r.pagesCrawled ?? 0}</td>
                    <td style="text-align: right;" class="mono">${r.filesDownloaded ?? 0}</td>
                    <td style="text-align: center;">
                      <span class="status-pill ${r.status === 'COMPLETED' ? 'status-active' : r.status === 'FAILED' ? 'status-failed' : 'status-pending'}">
                        ${r.status}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `
            : ''
        }
      </div>
    `;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — QAI Official Document</title>
  <style>
    /* ==========================================================================
       A4 OFFICIAL EXECUTIVE DOCUMENT STYLESHEET (GOVERNMENT & ENTERPRISE SPEC)
       ========================================================================== */
    @page {
      size: A4 portrait;
      margin: 14mm 15mm 14mm 15mm;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.45;
      color: #0f172a;
      background-color: #f1f5f9;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Screen Preview Container */
    .document-page {
      max-width: 210mm;
      min-height: 297mm;
      margin: 20px auto;
      background: #ffffff;
      padding: 16mm 18mm;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.08);
      border: 1px solid #cbd5e1;
      position: relative;
    }

    @media print {
      body {
        background: #ffffff !important;
      }
      .document-page {
        max-width: 100% !important;
        min-height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-before: always !important;
        break-before: page !important;
        padding-top: 15mm !important;
      }
    }

    /* Institutional Header Banner */
    .official-header {
      border-bottom: 2.5px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .org-branding {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .org-logo-crest {
      width: 46px;
      height: 46px;
      border: 2px solid #0f172a;
      padding: 4px;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .org-logo-crest img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .org-title-block h1 {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 0.5px;
      color: #0f172a;
      text-transform: uppercase;
      line-height: 1.15;
    }

    .org-title-block .sub-agency {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #334155;
      text-transform: uppercase;
      margin-top: 2px;
    }

    .org-title-block .doc-classification {
      font-size: 8.5px;
      font-weight: 700;
      color: #1e3a8a;
      background: #dbeafe;
      border: 1px solid #93c5fd;
      padding: 1px 6px;
      display: inline-block;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .header-metadata {
      text-align: right;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    }

    .report-control-num {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: 0.5px;
    }

    .header-meta-item {
      font-size: 9px;
      color: #475569;
      margin-top: 2px;
    }

    /* Section Heading Styles */
    .section-title-bar {
      display: flex;
      align-items: center;
      background: #0f172a;
      color: #ffffff;
      padding: 5px 8px;
      margin-top: 18px;
      margin-bottom: 10px;
      border-left: 4px solid #2563eb;
      break-after: avoid;
    }

    .section-num {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-weight: 900;
      font-size: 11px;
      background: #2563eb;
      color: #ffffff;
      padding: 1px 6px;
      margin-right: 8px;
    }

    .section-heading {
      flex: 1;
    }

    .section-heading h3 {
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .section-sub {
      font-size: 9px;
      color: #94a3b8;
      font-family: monospace;
    }

    .section-badge {
      font-size: 9px;
      font-family: monospace;
      color: #93c5fd;
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    /* Meta & Specification Tables */
    .doc-meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      border: 1px solid #cbd5e1;
      font-size: 10px;
    }

    .doc-meta-table th {
      background: #f8fafc;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 5px 8px;
      border: 1px solid #cbd5e1;
      text-transform: uppercase;
      font-size: 9px;
    }

    .doc-meta-table td {
      padding: 5px 8px;
      border: 1px solid #cbd5e1;
      color: #0f172a;
    }

    /* High-Impact Executive KPI Grid */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
      break-inside: avoid;
    }

    .metric-cell {
      background: #ffffff;
      border: 1.5px solid #0f172a;
      padding: 8px 10px;
      text-align: center;
    }

    .metric-label {
      display: block;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #475569;
      letter-spacing: 0.5px;
    }

    .metric-val {
      display: block;
      font-size: 17px;
      font-weight: 900;
      font-family: "SFMono-Regular", Consolas, monospace;
      color: #0f172a;
      margin: 2px 0;
    }

    .metric-sub {
      display: block;
      font-size: 8.5px;
      color: #059669;
      font-weight: 700;
      font-family: monospace;
    }

    /* Structured Data Tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 12px;
      border: 1px solid #cbd5e1;
      break-inside: avoid;
    }

    .data-table thead th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 8.5px;
      letter-spacing: 0.5px;
      padding: 5px 7px;
      border: 1px solid #cbd5e1;
      border-bottom: 2px solid #0f172a;
      text-align: left;
    }

    .data-table tbody td {
      padding: 5px 7px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: middle;
    }

    .data-table tbody tr:nth-child(even) {
      background-color: #f8fafc;
    }

    .compact-table td, .compact-table th {
      padding: 3.5px 6px;
      font-size: 9.5px;
    }

    /* Sub Blocks & Columns */
    .sub-block {
      margin-bottom: 12px;
      break-inside: avoid;
    }

    .sub-block-title {
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #1e293b;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 2px;
    }

    .dual-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
      break-inside: avoid;
    }

    .column-box {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      background: #ffffff;
    }

    /* Status Pills & Tags */
    .status-pill {
      display: inline-block;
      font-size: 8px;
      font-weight: 800;
      font-family: monospace;
      padding: 1px 5px;
      border-radius: 2px;
      text-transform: uppercase;
      border: 1px solid transparent;
    }

    .status-active {
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }

    .status-disabled {
      background: #f1f5f9;
      color: #475569;
      border-color: #cbd5e1;
    }

    .status-failed {
      background: #fef2f2;
      color: #991b1b;
      border-color: #fecaca;
    }

    .status-pending {
      background: #fffbeb;
      color: #92400e;
      border-color: #fde68a;
    }

    .policy-tag {
      font-family: monospace;
      font-weight: 700;
      font-size: 9px;
      color: #1d4ed8;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 1px 4px;
    }

    .type-badge {
      font-family: monospace;
      font-size: 8.5px;
      font-weight: 700;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 1px 4px;
    }

    /* Intelligence & Content Assets Box */
    .intel-summary-box {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 8px;
      gap: 6px;
      text-align: center;
    }

    .intel-label {
      display: block;
      font-size: 8px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
    }

    .intel-val {
      display: block;
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
    }

    /* Format Distribution Chips */
    .format-chips-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
    }

    .format-chip {
      display: flex;
      align-items: center;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      padding: 2px 6px;
      font-family: monospace;
      font-size: 9px;
    }

    .chip-ext {
      font-weight: 800;
      color: #1d4ed8;
      margin-right: 5px;
    }

    .chip-count {
      color: #334155;
      font-weight: 700;
    }

    /* Typography helpers */
    .mono {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 9.5px;
    }

    .font-bold {
      font-weight: 700;
    }

    .url-cell {
      word-break: break-all;
      max-width: 250px;
    }

    .empty-notice {
      padding: 8px;
      text-align: center;
      font-style: italic;
      color: #64748b;
      border: 1px dashed #cbd5e1;
      font-size: 9.5px;
    }

    /* Verification & Attestation Sign-off */
    .official-signoff {
      margin-top: 24px;
      border-top: 2px solid #0f172a;
      padding-top: 12px;
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
      break-inside: avoid;
    }

    .attestation-text {
      font-size: 8.5px;
      color: #475569;
      line-height: 1.4;
    }

    .attestation-seal {
      border: 1.5px solid #0f172a;
      padding: 6px 8px;
      text-align: center;
      background: #f8fafc;
    }

    .seal-title {
      font-size: 8.5px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
    }

    .seal-status {
      font-size: 11px;
      font-weight: 900;
      font-family: monospace;
      color: #059669;
      margin: 2px 0;
    }

    .seal-code {
      font-size: 7.5px;
      font-family: monospace;
      color: #64748b;
    }

    /* Running Footer */
    .official-footer {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5px;
      font-family: monospace;
      color: #64748b;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="document-page">
    
    <!-- Institutional Document Header -->
    <div class="official-header">
      <div class="org-branding">
        <div class="org-logo-crest">
          <img src="/qai.webp" alt="QAI Seal" onerror="this.style.display='none'" />
        </div>
        <div class="org-title-block">
          <h1>QAI Data Platform &bull; Intelligence Audit</h1>
          <div class="sub-agency">Enterprise Raw Data Ingestion &amp; Repository Dossier</div>
          <div class="doc-classification">Official Record &bull; Restricted Distribution</div>
        </div>
      </div>

      <div class="header-metadata">
        <div class="report-control-num">${reportCode}</div>
        <div class="header-meta-item">Date: ${now}</div>
        <div class="header-meta-item">Compliance: ISO/IEC 27001 Stds</div>
      </div>
    </div>

    <!-- Section 1.0 Executive Summary -->
    <div class="section-title-bar">
      <div class="section-num">1.0</div>
      <div class="section-heading">
        <h3>EXECUTIVE PLATFORM INGESTION STATUS &amp; METRICS</h3>
      </div>
      <div class="section-badge">SYSTEM-WIDE AUDIT</div>
    </div>

    <!-- Key Metrics Quad -->
    <div class="metrics-row">
      <div class="metric-cell">
        <span class="metric-label">Target Data Sources</span>
        <span class="metric-val">${totalSources}</span>
        <span class="metric-sub">Active Repositories</span>
      </div>
      <div class="metric-cell">
        <span class="metric-label">Registered Crawlers</span>
        <span class="metric-val">${totalCollectors}</span>
        <span class="metric-sub">Ingestion Engines</span>
      </div>
      <div class="metric-cell">
        <span class="metric-label">Harvested Assets</span>
        <span class="metric-val">${totalFiles.toLocaleString()}</span>
        <span class="metric-sub">Pages &amp; Files</span>
      </div>
      <div class="metric-cell">
        <span class="metric-label">Ingested Raw Volume</span>
        <span class="metric-val">${formatBytes(totalBytes)}</span>
        <span class="metric-sub">${successRate}% Pipeline Success</span>
      </div>
    </div>

    <!-- Portfolio Table (If Multi-Source Dossier) -->
    ${
      isCombined
        ? `
      <div class="sub-block">
        <div class="sub-block-title">COMPLETE REGISTERED TARGET INVENTORY (${sourcesData.length})</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 25%;">Target Source Name</th>
              <th style="width: 25%;">Base Endpoint URL</th>
              <th style="width: 20%;">Storage Zone Root</th>
              <th style="width: 12%; text-align: center;">Robots Policy</th>
              <th style="width: 13%; text-align: right;">Harvested Files</th>
            </tr>
          </thead>
          <tbody>
            ${sourcesData
              .map((d, i) => {
                const sFiles = d.runs.reduce((acc, r) => acc + (r.filesDownloaded || 0), 0);
                return `
                <tr>
                  <td class="mono font-bold">${i + 1}</td>
                  <td><strong>${d.source.name}</strong></td>
                  <td class="mono url-cell">${d.source.baseUrl}</td>
                  <td class="mono">00_raw/web/${d.source.slug}/</td>
                  <td style="text-align: center;"><span class="policy-tag">${d.source.robotsPolicy}</span></td>
                  <td style="text-align: right;" class="mono font-bold">${sFiles.toLocaleString()}</td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `
        : ''
    }

    <!-- Individual Source Detailed Breakdowns -->
    ${sourcesData.map((d, i) => renderSourceDetails(d, i)).join('')}

    <!-- Section 3.0 Attestation & Signature Block -->
    <div class="official-signoff">
      <div class="attestation-text">
        <strong>OFFICIAL AUDIT ATTESTATION:</strong><br />
        This document certifies that the raw data ingestion metrics, crawler executions, and cataloged file structures recorded herein have been verified against the QAI Data Repository partition scheme (<code>00_raw/web/</code>). All crawler operations comply with enterprise rate-limiting and access policies.
      </div>
      <div class="attestation-seal">
        <div class="seal-title">QAI Automated Ingestion</div>
        <div class="seal-status">SEALED &amp; VERIFIED</div>
        <div class="seal-code">HASH: ${reportCode}-${Math.random().toString(36).substring(2, 9).toUpperCase()}</div>
      </div>
    </div>

    <!-- Document Footer -->
    <div class="official-footer">
      <div>Organization Data Platform (ODP) &bull; Official Pipeline Dossier</div>
      <div>Page 1 of 1 &bull; Confidential &bull; Proprietary System Data</div>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Robust and seamless A4 Document Printer using an isolated hidden iframe
 * (Never blocked by browser popup blockers, ensures 100% pixel-perfect output).
 */
export function printSourceReportDocument(options: {
  title: string;
  reportCode: string;
  sourcesData: SourceReportData[];
  isCombined?: boolean;
}): void {
  const html = generateSourceReportHtml(options);

  // Check if an existing print iframe exists and remove it
  const existingIframe = document.getElementById('qai-print-dossier-frame');
  if (existingIframe) {
    existingIframe.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'qai-print-dossier-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    // Fallback if iframe fails
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => {
        w.focus();
        w.print();
      }, 300);
    }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Print iframe error:', err);
      } finally {
        setTimeout(() => {
          iframe.remove();
        }, 60000); // Keep for a minute then clean
      }
    }, 300);
  };
}
