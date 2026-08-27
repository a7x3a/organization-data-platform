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
    const pathSections = Object.entries(pathSectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

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
      margin: 10mm 12mm 10mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 10px;
      line-height: 1.35;
      color: #0f172a;
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
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-logo {
      width: 36px;
      height: 36px;
      object-fit: contain;
    }
    .brand-title {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .brand-sub {
      font-size: 9px;
      color: #475569;
      font-weight: 500;
    }
    .header-user-meta {
      text-align: right;
      font-family: monospace;
      font-size: 8.5px;
      color: #334155;
      line-height: 1.35;
    }
    .header-user-meta strong {
      color: #0f172a;
    }

    /* Executive KPIs Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }
    .kpi-card {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      padding: 6px 8px;
      border-radius: 4px;
    }
    .kpi-label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.3px;
    }
    .kpi-val {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      font-family: monospace;
      margin-top: 1px;
    }
    .kpi-sub {
      font-size: 7.5px;
      color: #475569;
      margin-top: 1px;
    }

    /* Section Headings */
    .section-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      color: #0f172a;
      letter-spacing: 0.5px;
      background: #f1f5f9;
      border-left: 3px solid #0f172a;
      padding: 3px 6px;
      margin-top: 8px;
      margin-bottom: 6px;
      break-after: avoid;
    }

    /* Clean Minimal Tables */
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 8px;
      break-inside: avoid;
    }
    .report-table th {
      background: #f8fafc;
      color: #0f172a;
      font-weight: 700;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 4px 6px;
      border: 1px solid #cbd5e1;
      border-bottom: 1.5px solid #0f172a;
      text-align: left;
    }
    .report-table td {
      padding: 4px 6px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: middle;
    }
    .report-table tr:nth-child(even) td {
      background: #fbfcfe;
    }

    .mono {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 8.5px;
    }
    .text-right {
      text-align: right;
    }
    .text-center {
      text-align: center;
    }
    .font-bold {
      font-weight: 700;
    }

    /* PDF Status Badges */
    .pct-tag {
      font-family: monospace;
      font-size: 8px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 2px;
      display: inline-block;
    }
    .pct-digital {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .pct-ocr {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }

    /* Sub-columns layout */
    .two-cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 6px;
      break-inside: avoid;
    }
    .col-box {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      background: #ffffff;
      border-radius: 2px;
    }
    .col-header {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 3px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 2px;
    }

    /* Explanatory notes for non-technical readers */
    .info-note {
      font-size: 8px;
      color: #64748b;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 4px 6px;
      border-radius: 2px;
      margin-bottom: 8px;
    }

    /* Footer */
    .report-footer {
      border-top: 1px solid #cbd5e1;
      margin-top: 10px;
      padding-top: 4px;
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      font-family: monospace;
      color: #64748b;
      break-inside: avoid;
    }

    @media print {
      body {
        background: #ffffff !important;
      }
      .page-break {
        page-break-before: always;
        break-before: page;
        padding-top: 6mm;
      }
    }
  </style>
</head>
<body>
  <div class="report-sheet">
    
    <!-- 1. Top Header: [Logo - Platform Name - User] -->
    <div class="header-bar">
      <div class="header-brand">
        <img src="/qai.webp" alt="QAI Logo" class="header-logo" onerror="this.style.display='none'" />
        <div>
          <div class="brand-title">QAI Organization Data Platform</div>
          <div class="brand-sub">Executive Ingestion Status &amp; Content Architecture Dossier</div>
        </div>
      </div>
      <div class="header-user-meta">
        <div><strong>Operator:</strong> ${userName}</div>
        <div><strong>Generated:</strong> ${now}</div>
        <div><strong>Ref:</strong> ${reportCode}</div>
      </div>
    </div>

    <!-- Executive KPI Summary Cards (Instantly readable by both executives & engineers) -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Active Targets</div>
        <div class="kpi-val">${sourceStats.length} Sources</div>
        <div class="kpi-sub">${sourceStats.reduce((acc, s) => acc + s.subdomains.length, 0)} Total Hostnames</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Ingested Data</div>
        <div class="kpi-val">${grandTotalFiles.toLocaleString()} Items</div>
        <div class="kpi-sub">${formatBytes(grandTotalSize)} Storage Volume</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Digital Native PDFs</div>
        <div class="kpi-val" style="color: #1d4ed8;">${grandDigitalPdfs.toLocaleString()} (${grandDigitalPct}%)</div>
        <div class="kpi-sub">Direct Text Extraction Ready</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Scanned / OCR PDFs</div>
        <div class="kpi-val" style="color: #b45309;">${grandOcrPdfs.toLocaleString()} (${grandOcrPct}%)</div>
        <div class="kpi-sub">Requires OCR Pipeline</div>
      </div>
    </div>

    <!-- 2. Table of Contents / Main Sources Summary Table -->
    <div class="section-title">1.0 Source Targets &amp; Data Inventory</div>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width: 22%;">Target Source</th>
          <th style="width: 14%; text-align: right;">Total Data</th>
          <th style="width: 20%;">File Distribution</th>
          <th style="width: 26%;">PDF Processing Classification</th>
          <th style="width: 18%;">Discovered Endpoints</th>
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
                <div class="font-bold">${s.source.name}</div>
                <div class="mono" style="color: #2563eb; font-size: 8px;">${s.source.baseUrl}</div>
              </td>
              <td class="text-right">
                <div class="mono font-bold">${s.totalFiles.toLocaleString()} files</div>
                <div class="mono" style="color: #64748b; font-size: 8px;">${formatBytes(s.totalSize)}</div>
              </td>
              <td class="mono" style="font-size: 8px;">
                ${extSummaries || '—'}
              </td>
              <td>
                ${
                  s.totalPdfCount > 0
                    ? `
                  <div class="mono font-bold">${s.totalPdfCount.toLocaleString()} PDFs (${formatBytes(s.totalSize)})</div>
                  <div style="margin-top: 2px; display: flex; gap: 4px;">
                    <span class="pct-tag pct-digital">Digital: ${s.digitalPdfCount} (${s.digitalPct}%)</span>
                    <span class="pct-tag pct-ocr">OCR: ${s.ocrPdfCount} (${s.ocrPct}%)</span>
                  </div>
                `
                    : '<span style="color: #94a3b8; font-size: 8px;">No PDFs collected</span>'
                }
              </td>
              <td class="mono" style="font-size: 8px;">
                ${s.subdomains.length} host(s) &bull; ${s.pathSections.length} sections
              </td>
            </tr>
          `;
          })
          .join('')}
        
        ${
          sourceStats.length > 1
            ? `
          <tr style="background: #f1f5f9; font-weight: 700; border-top: 2px solid #0f172a;">
            <td>TOTAL ENTERPRISE DATA</td>
            <td class="text-right mono font-bold">
              ${grandTotalFiles.toLocaleString()} files<br />
              <span style="font-size: 8px; color: #475569;">${formatBytes(grandTotalSize)}</span>
            </td>
            <td class="mono" style="font-size: 8px;">All Registered Targets</td>
            <td>
              <div class="mono font-bold">${grandTotalPdfs.toLocaleString()} Total PDFs</div>
              <div style="margin-top: 2px; display: flex; gap: 4px;">
                <span class="pct-tag pct-digital">Digital: ${grandDigitalPdfs} (${grandDigitalPct}%)</span>
                <span class="pct-tag pct-ocr">OCR: ${grandOcrPdfs} (${grandOcrPct}%)</span>
              </div>
            </td>
            <td class="mono font-bold">${sourceStats.reduce((acc, s) => acc + s.subdomains.length, 0)} Total Hosts</td>
          </tr>
        `
            : ''
        }
      </tbody>
    </table>

    <!-- 3. Per-Source Detailed Sections: Discovered Subdomains & Web Links -->
    <div class="section-title">2.0 Website Taxonomy, Discovered Subdomains &amp; Links</div>

    ${sourceStats
      .map((s, idx) => `
      <div class="source-detail-entry ${idx > 0 && isCombined ? 'page-break' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; margin-bottom: 4px; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px;">
          <div class="font-bold" style="font-size: 9.5px;">
            TARGET ${idx + 1}: ${s.source.name} &bull; <span class="mono" style="color: #2563eb;">${s.source.baseUrl}</span>
          </div>
          <div class="mono" style="font-size: 8px; color: #64748b;">
            Partition: 00_raw/web/${s.source.slug}/ &bull; ${s.totalFiles} items (${formatBytes(s.totalSize)})
          </div>
        </div>

        <div class="two-cols">
          <!-- Discovered Subdomains -->
          <div class="col-box">
            <div class="col-header">Discovered Subdomains &amp; Hostnames (${s.subdomains.length})</div>
            ${
              s.subdomains.length > 0
                ? `
              <table class="report-table" style="margin-bottom: 0;">
                <thead>
                  <tr>
                    <th>Domain / Subdomain</th>
                    <th style="width: 25%; text-align: right;">URLs</th>
                  </tr>
                </thead>
                <tbody>
                  ${s.subdomains.slice(0, 6).map(([host, count]) => `
                    <tr>
                      <td class="mono font-bold">${host}</td>
                      <td class="mono text-right" style="color: #2563eb;">${count.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `
                : '<div style="color: #94a3b8; font-size: 8px; padding: 4px;">Primary domain only (no separate subdomains).</div>'
            }
          </div>

          <!-- Discovered Web Categories & Path Links -->
          <div class="col-box">
            <div class="col-header">Discovered Content Sections &amp; URL Paths</div>
            ${
              s.pathSections.length > 0
                ? `
              <table class="report-table" style="margin-bottom: 0;">
                <thead>
                  <tr>
                    <th>URL Path / Section</th>
                    <th style="width: 25%; text-align: right;">Objects</th>
                  </tr>
                </thead>
                <tbody>
                  ${s.pathSections.slice(0, 6).map(([sec, count]) => `
                    <tr>
                      <td class="mono font-bold" style="color: #0f766e;">${sec}</td>
                      <td class="mono text-right">${count.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `
                : '<div style="color: #94a3b8; font-size: 8px; padding: 4px;">Standard root index.</div>'
            }
          </div>
        </div>
      </div>
    `).join('')}

    <!-- Official Running Footer -->
    <div class="report-footer">
      <div>Organization Data Platform (ODP) &bull; Official Ingestion &amp; Quality Audit Dossier</div>
      <div>Confidential Document &bull; Generated for ${userName}</div>
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
