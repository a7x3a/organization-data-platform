import { Source, CollectedFile, CollectionRun, Collector } from '@odp/shared-types';
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
  userName?: string;
}): string {
  const { title, reportCode, sourcesData, userName = 'System Administrator' } = options;
  const nowMonthYear = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const nowFullDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const sourceStats = sourcesData.map((data) => {
    const { source, collectors, runs, files } = data;

    let totalPdfCount = 0;
    let digitalPdfCount = 0;
    let ocrPdfCount = 0;
    let htmlCount = 0;
    let jsonCount = 0;
    let mediaCount = 0;
    let otherCount = 0;

    const extCounts: Record<string, number> = {};
    const subdomainsMap: Record<string, number> = {};
    const pathSectionsMap: Record<string, number> = {};
    let totalSize = 0;

    files.forEach((f) => {
      const ext = f.extension?.toLowerCase().replace('.', '') || 'other';
      extCounts[ext] = (extCounts[ext] || 0) + 1;
      totalSize += Number(f.fileSize) || 0;

      if (ext === 'html' || ext === 'htm') htmlCount++;
      else if (ext === 'json' || ext === 'jsonl') jsonCount++;
      else if (['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mp3', 'wav'].includes(ext)) mediaCount++;
      else otherCount++;

      // Classify PDF (Digital vs OCR)
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
    const pathSections = Object.entries(pathSectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 4);

    return {
      source,
      collectors,
      runs,
      files,
      totalFiles: files.length,
      totalSize,
      totalPdfCount,
      digitalPdfCount,
      ocrPdfCount,
      digitalPct,
      ocrPct,
      htmlCount,
      jsonCount,
      mediaCount,
      otherCount,
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
  const grandDigitalPct = grandTotalPdfs > 0 ? Math.round((grandDigitalPdfs / grandTotalPdfs) * 100) : 75;
  const grandOcrPct = 100 - grandDigitalPct;

  const maxSourceFiles = Math.max(...sourceStats.map((s) => s.totalFiles), 1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} — QAI Data Platform</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 8mm 10mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5px;
      line-height: 1.35;
      color: #334155;
      background-color: #f8fafc;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      padding: 10px;
    }

    .report-card {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    /* ─── Header: Left Logo & Name, Right Blue Action Block ─── */
    .header-banner {
      display: grid;
      grid-template-columns: 1fr 1.3fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .header-left-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header-brand-row {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .header-logo {
      width: 28px;
      height: 28px;
      object-fit: contain;
    }
    .brand-name {
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.1;
      letter-spacing: -0.2px;
    }
    .brand-caption {
      font-size: 8px;
      color: #64748b;
      font-weight: 500;
    }
    .header-meta-row {
      border-top: 1px solid #e2e8f0;
      padding-top: 5px;
      margin-top: 6px;
    }
    .meta-date {
      font-size: 9.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .meta-presenter {
      font-size: 8px;
      color: #64748b;
    }

    .header-right-box {
      background: #1d68f2;
      border-radius: 4px;
      padding: 14px 16px;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .header-blue-title {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
      letter-spacing: -0.2px;
    }
    .header-blue-sub {
      font-size: 9.5px;
      color: rgba(255, 255, 255, 0.9);
      margin-top: 3px;
      font-weight: 400;
    }

    /* ─── Executive Summary KPI Cards ─── */
    .section-heading {
      font-size: 10px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .kpi-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }
    .kpi-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .kpi-top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .kpi-icon-badge {
      width: 26px;
      height: 26px;
      border-radius: 4px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d68f2;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kpi-label {
      font-size: 8.5px;
      font-weight: 600;
      color: #475569;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .kpi-value {
      font-size: 15px;
      font-weight: 700;
      color: #1d68f2;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      letter-spacing: -0.3px;
    }
    .kpi-foot {
      font-size: 7.8px;
      color: #64748b;
      margin-top: 1px;
    }

    /* ─── Sharp Content Panels ─── */
    .content-panel {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 10px;
    }
    .panel-title {
      font-size: 9.5px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }

    .chart-layout {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 12px;
      align-items: center;
    }

    /* Bar Chart Rows */
    .bar-chart-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .bar-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .bar-label-line {
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #334155;
    }
    .bar-track {
      width: 100%;
      height: 12px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 2px;
      overflow: hidden;
      display: flex;
    }
    .bar-fill {
      height: 100%;
      background: #1d68f2;
      border-radius: 1px;
      min-width: 4px;
    }

    /* Legend List */
    .legend-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
      border-left: 2px solid #1d68f2;
      padding-left: 9px;
    }
    .legend-item {
      display: flex;
      flex-direction: column;
    }
    .legend-name {
      font-size: 8px;
      color: #475569;
      font-weight: 500;
    }
    .legend-val {
      font-size: 11px;
      font-weight: 700;
      color: #1d68f2;
    }

    /* ─── PDF Breakdown Panel ─── */
    .pie-layout {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 12px;
      align-items: center;
    }
    .pie-chart-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .pie-circle {
      width: 78px;
      height: 78px;
      border-radius: 50%;
      background: conic-gradient(#1d68f2 0% ${grandDigitalPct}%, #93c5fd ${grandDigitalPct}% 100%);
      position: relative;
      flex-shrink: 0;
      border: 1px solid #cbd5e1;
    }
    .pie-legend-labels {
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-size: 8px;
    }
    .pie-legend-entry {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .pie-color-dot {
      width: 8px;
      height: 8px;
      border-radius: 2px;
    }

    .pie-metrics {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-left: 2px solid #1d68f2;
      padding-left: 9px;
    }

    /* ─── Footer ─── */
    .report-footer {
      display: flex;
      justify-content: space-between;
      font-size: 7.8px;
      color: #64748b;
      margin-top: 6px;
      padding: 0 2px;
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
    }

    @media print {
      body {
        background: #ffffff !important;
        padding: 0;
      }
      .report-card {
        border: 0;
        box-shadow: none;
        padding: 0;
        background: #ffffff;
      }
    }
  </style>
</head>
<body>
  <div class="report-card">
    
    <!-- 1. Header: Left Logo & Name, Right Blue Action Title -->
    <div class="header-banner">
      <div class="header-left-box">
        <div class="header-brand-row">
          <img src="/qai.webp" alt="QAI" class="header-logo" onerror="this.style.display='none'" />
          <div>
            <div class="brand-name">QAI Organization</div>
            <div class="brand-caption">Data Platform</div>
          </div>
        </div>
        <div class="header-meta-row">
          <div class="meta-date">${nowMonthYear}</div>
          <div class="meta-presenter">Presented by ${userName}</div>
        </div>
      </div>

      <div class="header-right-box">
        <div class="header-blue-title">Data Collection &amp; Ingestion Report</div>
        <div class="header-blue-sub">Platform Raw Asset &amp; Intelligence Summary</div>
      </div>
    </div>

    <!-- 2. Executive Summary -->
    <div class="section-heading">Executive Summary</div>
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d68f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
          </div>
          <div class="kpi-label">Total Ingested<br />Data</div>
        </div>
        <div class="kpi-value">${grandTotalFiles.toLocaleString()} Items</div>
        <div class="kpi-foot">${formatBytes(grandTotalSize)} Storage Volume</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d68f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="kpi-label">Digital Native<br />PDFs</div>
        </div>
        <div class="kpi-value">${grandDigitalPdfs.toLocaleString()}</div>
        <div class="kpi-foot">${grandDigitalPct}% Direct Text Extraction Ready</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d68f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </div>
          <div class="kpi-label">Scanned / OCR<br />PDFs</div>
        </div>
        <div class="kpi-value">${grandOcrPdfs.toLocaleString()}</div>
        <div class="kpi-foot">${grandOcrPct}% Vision OCR Pipeline Required</div>
      </div>
    </div>

    <!-- 3. Sources Data Volume Comparison Panel -->
    <div class="content-panel">
      <div class="panel-title">Target Sources Ingestion Comparison</div>
      <div class="chart-layout">
        <div class="bar-chart-container">
          ${sourceStats
            .slice(0, 4)
            .map((s, idx) => {
              const barWidth = Math.max(Math.round((s.totalFiles / maxSourceFiles) * 100), 8);
              const color = idx === 0 ? '#1d68f2' : idx === 1 ? '#3b82f6' : idx === 2 ? '#60a5fa' : '#93c5fd';
              return `
              <div class="bar-row">
                <div class="bar-label-line">
                  <span style="font-weight: 600;">${s.source.name}</span>
                  <span style="color: #64748b;">${formatBytes(s.totalSize)}</span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${barWidth}%; background: ${color};"></div>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>

        <div class="legend-list">
          ${sourceStats
            .slice(0, 3)
            .map((s) => `
            <div class="legend-item">
              <div class="legend-name">${s.source.name}</div>
              <div class="legend-val">${s.totalFiles.toLocaleString()} files</div>
            </div>
          `)
            .join('')}
        </div>
      </div>
    </div>

    <!-- 4. PDF Corpus Breakdown Panel -->
    <div class="content-panel" style="margin-bottom: 6px;">
      <div class="panel-title">Corpus Status by Extraction Type</div>
      <div class="pie-layout">
        <div class="pie-chart-wrap">
          <div class="pie-circle"></div>
          <div class="pie-legend-labels">
            <div class="pie-legend-entry">
              <div class="pie-color-dot" style="background: #1d68f2;"></div>
              <span>Digital Native Text (${grandDigitalPct}%)</span>
            </div>
            <div class="pie-legend-entry">
              <div class="pie-color-dot" style="background: #93c5fd;"></div>
              <span>Scanned OCR Required (${grandOcrPct}%)</span>
            </div>
          </div>
        </div>

        <div class="pie-metrics">
          <div>
            <div class="legend-name">Digital Native Text</div>
            <div class="legend-val">${grandDigitalPdfs.toLocaleString()} PDFs</div>
          </div>
          <div>
            <div class="legend-name">Scanned OCR Extraction</div>
            <div class="legend-val" style="color: #60a5fa;">${grandOcrPdfs.toLocaleString()} PDFs</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. Footer -->
    <div class="report-footer">
      <div>Official Ingestion &amp; Intelligence Summary &bull; Ref: ${reportCode}</div>
      <div>QAI Organization Data Platform &bull; ${nowFullDate}</div>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Direct A4 Document Printer using an isolated hidden iframe
 * (Zero popups, zero redirects, 100% reliable native print dialog).
 */
export function printSourceReportDocument(options: {
  title: string;
  reportCode: string;
  sourcesData: SourceReportData[];
  isCombined?: boolean;
  userName?: string;
}): void {
  const html = generateSourceReportHtml(options);

  const existingIframe = document.getElementById('qai-print-dossier-frame');
  if (existingIframe) {
    existingIframe.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'qai-print-dossier-frame';
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Print iframe error:', err);
      // Fallback: open print preview
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        printWin.print();
      } else {
        window.print();
      }
    } finally {
      setTimeout(() => {
        iframe.remove();
      }, 60000);
    }
  }, 300);
}
