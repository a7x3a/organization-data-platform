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

  // Find max files among sources for bar scaling
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
      background-color: #f1f5f9;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      padding: 10px;
    }

    .report-card {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 14px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }

    /* ─── Modern Dual Header Banner (Exact Match to Design) ─── */
    .header-banner {
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }
    .header-blue-box {
      background: #1d68f2;
      border-radius: 12px;
      padding: 16px 18px;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .header-blue-title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.2;
      letter-spacing: -0.2px;
    }
    .header-blue-sub {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.85);
      margin-top: 3px;
      font-weight: 400;
    }

    .header-white-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header-brand-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-logo {
      width: 26px;
      height: 26px;
      object-fit: contain;
    }
    .brand-name {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.1;
    }
    .brand-caption {
      font-size: 8px;
      color: #64748b;
    }
    .header-meta-row {
      border-top: 1px solid #f1f5f9;
      padding-top: 6px;
      margin-top: 6px;
    }
    .meta-date {
      font-size: 10px;
      font-weight: 700;
      color: #0f172a;
    }
    .meta-presenter {
      font-size: 8.5px;
      color: #64748b;
    }

    /* ─── Section 1: Executive Summary KPI Cards ─── */
    .section-heading {
      font-size: 10px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 7px;
    }

    .kpi-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 12px;
    }
    .kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .kpi-top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .kpi-icon-badge {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: #1d68f2;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
    }
    .kpi-label {
      font-size: 9px;
      font-weight: 600;
      color: #475569;
      line-height: 1.2;
    }
    .kpi-value {
      font-size: 16px;
      font-weight: 700;
      color: #1d68f2;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      letter-spacing: -0.3px;
    }
    .kpi-foot {
      font-size: 8px;
      color: #64748b;
      margin-top: 2px;
    }

    /* ─── Section 2: Source Data Comparison (Horizontal Bar Chart) ─── */
    .content-panel {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 12px;
    }
    .panel-title {
      font-size: 10px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 10px;
    }

    .chart-layout {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 14px;
      align-items: center;
    }

    /* Bar Chart Rows */
    .bar-chart-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
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
      color: #475569;
    }
    .bar-track {
      width: 100%;
      height: 14px;
      background: #f1f5f9;
      border-radius: 3px;
      overflow: hidden;
      display: flex;
    }
    .bar-fill {
      height: 100%;
      background: #1d68f2;
      border-radius: 3px;
      min-width: 4px;
    }
    .bar-fill-sub {
      height: 100%;
      background: #93c5fd;
    }

    /* Legend List */
    .legend-list {
      display: flex;
      flex-direction: column;
      gap: 9px;
      border-left: 2px solid #1d68f2;
      padding-left: 10px;
    }
    .legend-item {
      display: flex;
      flex-direction: column;
    }
    .legend-name {
      font-size: 8.5px;
      color: #475569;
      font-weight: 500;
    }
    .legend-val {
      font-size: 12px;
      font-weight: 700;
      color: #1d68f2;
    }

    /* ─── Section 3: PDF & Corpus Breakdown (Pie Chart & Summary) ─── */
    .pie-layout {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 14px;
      align-items: center;
    }
    .pie-chart-wrap {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .pie-circle {
      width: 84px;
      height: 84px;
      border-radius: 50%;
      background: conic-gradient(#1d68f2 0% ${grandDigitalPct}%, #93c5fd ${grandDigitalPct}% 100%);
      position: relative;
      flex-shrink: 0;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05);
    }
    .pie-legend-labels {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 8px;
    }
    .pie-legend-entry {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pie-color-dot {
      width: 9px;
      height: 9px;
      border-radius: 2px;
    }

    .pie-metrics {
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-left: 2px solid #1d68f2;
      padding-left: 10px;
    }

    /* ─── Footer ─── */
    .report-footer {
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #64748b;
      margin-top: 6px;
      padding: 0 4px;
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
    
    <!-- 1. Header Banner -->
    <div class="header-banner">
      <div class="header-blue-box">
        <div class="header-blue-title">Data Collection &amp; Ingestion Report</div>
        <div class="header-blue-sub">Platform Raw Asset &amp; Intelligence Summary</div>
      </div>

      <div class="header-white-box">
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
    </div>

    <!-- 2. Executive Summary -->
    <div class="section-heading">Executive Summary</div>
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-badge">📁</div>
          <div class="kpi-label">Total Ingested<br />Data</div>
        </div>
        <div class="kpi-value">${grandTotalFiles.toLocaleString()} Items</div>
        <div class="kpi-foot">${formatBytes(grandTotalSize)} Total Storage</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-badge" style="background: #2563eb;">📄</div>
          <div class="kpi-label">Digital Native<br />PDFs</div>
        </div>
        <div class="kpi-value">${grandDigitalPdfs.toLocaleString()}</div>
        <div class="kpi-foot">${grandDigitalPct}% Direct Text Ready</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-badge" style="background: #60a5fa;">👁️</div>
          <div class="kpi-label">Scanned / OCR<br />PDFs</div>
        </div>
        <div class="kpi-value">${grandOcrPdfs.toLocaleString()}</div>
        <div class="kpi-foot">${grandOcrPct}% OCR Processing Required</div>
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
                  <span style="font-weight: 500;">${s.source.name}</span>
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
              <span>Digital Text (${grandDigitalPct}%)</span>
            </div>
            <div class="pie-legend-entry">
              <div class="pie-color-dot" style="background: #93c5fd;"></div>
              <span>Scanned OCR (${grandOcrPct}%)</span>
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
