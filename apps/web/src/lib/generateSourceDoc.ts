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
  const { title, reportCode, sourcesData, isCombined = false, userName = 'System Administrator' } = options;
  const now = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const sourceStats = sourcesData.map((data) => {
    const { source, collectors, runs, files } = data;

    let totalPdfCount = 0;
    let digitalPdfCount = 0;
    let ocrPdfCount = 0;
    const extCounts: Record<string, number> = {};
    const subdomainsMap: Record<string, number> = {};
    const pathSectionsMap: Record<string, number> = {};
    let totalSize = 0;

    files.forEach((f) => {
      const ext = f.extension?.toLowerCase().replace('.', '') || 'other';
      extCounts[ext] = (extCounts[ext] || 0) + 1;
      totalSize += Number(f.fileSize) || 0;

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

      // Discover subdomains & paths from website URLs
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
    const pathSections = Object.entries(pathSectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

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
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 9px;
      font-weight: 400;
      line-height: 1.35;
      color: #1e293b;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .report-sheet {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
    }

    /* 1. Header: [Logo - Platform Name - User] */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-logo {
      width: 28px;
      height: 28px;
      object-fit: contain;
    }
    .brand-title {
      font-size: 11px;
      font-weight: 600;
      color: #0f172a;
      letter-spacing: 0.2px;
    }
    .brand-sub {
      font-size: 8px;
      color: #64748b;
      font-weight: 400;
    }
    .header-user-meta {
      text-align: right;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 8px;
      color: #475569;
      line-height: 1.3;
    }

    /* Minimal Stats Strip */
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .summary-box {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      padding: 4px 6px;
      border-radius: 3px;
    }
    .summary-label {
      font-size: 7.5px;
      color: #64748b;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .summary-value {
      font-size: 11px;
      font-weight: 500;
      color: #0f172a;
      font-family: "SFMono-Regular", Consolas, monospace;
      margin-top: 1px;
    }
    .summary-sub {
      font-size: 7px;
      color: #64748b;
    }

    /* Section Headings */
    .section-title {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      color: #334155;
      letter-spacing: 0.3px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 2px;
      margin-top: 6px;
      margin-bottom: 4px;
      break-after: avoid;
    }

    /* Minimal Elegant Tables */
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5px;
      margin-bottom: 6px;
      break-inside: avoid;
    }
    .report-table th {
      background: #f8fafc;
      color: #475569;
      font-weight: 500;
      font-size: 7.5px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      padding: 3px 5px;
      border: 1px solid #e2e8f0;
      text-align: left;
    }
    .report-table td {
      padding: 3px 5px;
      border: 1px solid #f1f5f9;
      color: #334155;
      vertical-align: middle;
    }
    .report-table tr:nth-child(even) td {
      background: #fafafa;
    }

    .mono {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 8px;
    }
    .text-right {
      text-align: right;
    }

    /* Subtle PDF Tags with normal weights */
    .tag {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 7.5px;
      font-weight: 400;
      padding: 1px 3px;
      border-radius: 2px;
      display: inline-block;
    }
    .tag-digital {
      background: #eff6ff;
      color: #1e40af;
      border: 1px solid #dbeafe;
    }
    .tag-ocr {
      background: #fffbeb;
      color: #92400e;
      border: 1px solid #fef3c7;
    }

    /* Compact 2-column details without page breaks */
    .two-cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 2px;
      margin-bottom: 6px;
      break-inside: avoid;
    }
    .col-box {
      border: 1px solid #e2e8f0;
      padding: 4px 6px;
      background: #ffffff;
      border-radius: 2px;
    }
    .col-header {
      font-size: 7.5px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 2px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 1px;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }

    /* Footer */
    .report-footer {
      border-top: 1px solid #e2e8f0;
      margin-top: 8px;
      padding-top: 3px;
      display: flex;
      justify-content: space-between;
      font-size: 7.5px;
      font-family: "SFMono-Regular", Consolas, monospace;
      color: #94a3b8;
      break-inside: avoid;
    }

    @media print {
      body {
        background: #ffffff !important;
      }
    }
  </style>
</head>
<body>
  <div class="report-sheet">
    
    <!-- Header: [Logo - Platform Name - User] -->
    <div class="header-bar">
      <div class="header-brand">
        <img src="/qai.webp" alt="QAI" class="header-logo" onerror="this.style.display='none'" />
        <div>
          <div class="brand-title">QAI Organization Data Platform</div>
          <div class="brand-sub">Sources &amp; Raw Data Ingestion Status Dossier</div>
        </div>
      </div>
      <div class="header-user-meta">
        <div>Operator: ${userName}</div>
        <div>Date: ${now} &bull; Ref: ${reportCode}</div>
      </div>
    </div>

    <!-- Executive Summary Strip -->
    <div class="summary-strip">
      <div class="summary-box">
        <div class="summary-label">Monitored Targets</div>
        <div class="summary-value">${sourceStats.length} Sources</div>
        <div class="summary-sub">${sourceStats.reduce((acc, s) => acc + s.subdomains.length, 0)} Discovered Hostnames</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Ingested Data</div>
        <div class="summary-value">${grandTotalFiles.toLocaleString()} Items</div>
        <div class="summary-sub">${formatBytes(grandTotalSize)} Volume</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Digital Native PDFs</div>
        <div class="summary-value" style="color: #2563eb;">${grandDigitalPdfs.toLocaleString()} (${grandDigitalPct}%)</div>
        <div class="summary-sub">Text Extraction Ready</div>
      </div>
      <div class="summary-box">
        <div class="summary-label">Scanned / OCR PDFs</div>
        <div class="summary-value" style="color: #d97706;">${grandOcrPdfs.toLocaleString()} (${grandOcrPct}%)</div>
        <div class="summary-sub">Requires OCR Pipeline</div>
      </div>
    </div>

    <!-- 1.0 Source Targets & Data Inventory Table -->
    <div class="section-title">1.0 Source Inventory &amp; File Distribution</div>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width: 25%;">Target Source</th>
          <th style="width: 15%; text-align: right;">Total Data</th>
          <th style="width: 20%;">File Distribution</th>
          <th style="width: 25%;">PDF Breakdown (Digital vs OCR)</th>
          <th style="width: 15%;">Endpoints</th>
        </tr>
      </thead>
      <tbody>
        ${sourceStats
          .map((s) => {
            const extSummaries = Object.entries(s.extCounts)
              .map(([ext, cnt]) => `.${ext}: ${cnt}`)
              .slice(0, 3)
              .join(', ');

            return `
            <tr>
              <td>
                <div style="font-weight: 500; color: #0f172a;">${s.source.name}</div>
                <div class="mono" style="color: #3b82f6; font-size: 7.5px;">${s.source.baseUrl}</div>
              </td>
              <td class="text-right">
                <div class="mono" style="font-weight: 500;">${s.totalFiles.toLocaleString()} files</div>
                <div class="mono" style="color: #64748b; font-size: 7.5px;">${formatBytes(s.totalSize)}</div>
              </td>
              <td class="mono" style="font-size: 7.5px;">
                ${extSummaries || '—'}
              </td>
              <td>
                ${
                  s.totalPdfCount > 0
                    ? `
                  <div class="mono" style="margin-bottom: 1px;">${s.totalPdfCount.toLocaleString()} PDFs</div>
                  <div style="display: flex; gap: 3px;">
                    <span class="tag tag-digital">Digital: ${s.digitalPdfCount} (${s.digitalPct}%)</span>
                    <span class="tag tag-ocr">OCR: ${s.ocrPdfCount} (${s.ocrPct}%)</span>
                  </div>
                `
                    : '<span style="color: #94a3b8; font-size: 7.5px;">0 PDFs</span>'
                }
              </td>
              <td class="mono" style="font-size: 7.5px;">
                ${s.subdomains.length} host(s) &bull; ${s.pathSections.length} paths
              </td>
            </tr>
          `;
          })
          .join('')}
        
        ${
          sourceStats.length > 1
            ? `
          <tr style="background: #f8fafc; font-weight: 500; border-top: 1px solid #cbd5e1;">
            <td>TOTAL PLATFORM DATA</td>
            <td class="text-right mono">
              ${grandTotalFiles.toLocaleString()} files<br />
              <span style="font-size: 7.5px; color: #64748b;">${formatBytes(grandTotalSize)}</span>
            </td>
            <td class="mono" style="font-size: 7.5px;">All Targets</td>
            <td>
              <div class="mono">${grandTotalPdfs.toLocaleString()} PDFs</div>
              <div style="display: flex; gap: 3px; margin-top: 1px;">
                <span class="tag tag-digital">Digital: ${grandDigitalPdfs} (${grandDigitalPct}%)</span>
                <span class="tag tag-ocr">OCR: ${grandOcrPdfs} (${grandOcrPct}%)</span>
              </div>
            </td>
            <td class="mono">${sourceStats.reduce((acc, s) => acc + s.subdomains.length, 0)} Total Hosts</td>
          </tr>
        `
            : ''
        }
      </tbody>
    </table>

    <!-- 2.0 Website Taxonomy & Subdomains (Unified on the same sheet without page breaks) -->
    <div class="section-title">2.0 Website Taxonomy &amp; Discovered Subdomains</div>

    ${sourceStats
      .map(
        (s, idx) => `
      <div style="margin-bottom: 4px; break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 1px 0; font-size: 8px;">
          <div style="font-weight: 500; color: #0f172a;">
            ${s.source.name} &bull; <span class="mono" style="color: #3b82f6;">${s.source.baseUrl}</span>
          </div>
          <div class="mono" style="color: #64748b;">
            Partition: 00_raw/web/${s.source.slug}/ &bull; ${s.totalFiles} items
          </div>
        </div>

        <div class="two-cols">
          <!-- Subdomains -->
          <div class="col-box">
            <div class="col-header">Discovered Subdomains (${s.subdomains.length})</div>
            ${
              s.subdomains.length > 0
                ? `
              <table class="report-table" style="margin-bottom: 0;">
                <tbody>
                  ${s.subdomains.slice(0, 4).map(([host, count]) => `
                    <tr>
                      <td class="mono">${host}</td>
                      <td class="mono text-right" style="color: #3b82f6;">${count} URLs</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `
                : '<div style="color: #94a3b8; font-size: 7.5px; padding: 2px;">Primary domain only</div>'
            }
          </div>

          <!-- Content Paths -->
          <div class="col-box">
            <div class="col-header">Discovered URL Endpoints (${s.pathSections.length})</div>
            ${
              s.pathSections.length > 0
                ? `
              <table class="report-table" style="margin-bottom: 0;">
                <tbody>
                  ${s.pathSections.slice(0, 4).map(([sec, count]) => `
                    <tr>
                      <td class="mono" style="color: #0f766e;">${sec}</td>
                      <td class="mono text-right">${count} items</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `
                : '<div style="color: #94a3b8; font-size: 7.5px; padding: 2px;">Root path index</div>'
            }
          </div>
        </div>
      </div>
    `
      )
      .join('')}

    <!-- Official Footer -->
    <div class="report-footer">
      <div>Organization Data Platform (ODP) &bull; Official Ingestion &amp; Content Audit Dossier</div>
      <div>Confidential &bull; Generated for ${userName}</div>
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
