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

  // Calculate detailed source-by-source metrics
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
    const pathSections = Object.entries(pathSectionsMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

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
      margin: 12mm 14mm 12mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.4;
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
      margin-bottom: 12px;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-logo {
      width: 38px;
      height: 38px;
      object-fit: contain;
    }
    .brand-title {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .brand-sub {
      font-size: 9px;
      color: #475569;
      font-family: monospace;
    }
    .header-user-meta {
      text-align: right;
      font-family: monospace;
      font-size: 9px;
      color: #334155;
      line-height: 1.35;
    }
    .header-user-meta strong {
      color: #0f172a;
    }

    /* Section Headings */
    .section-title {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      color: #0f172a;
      letter-spacing: 0.5px;
      background: #f1f5f9;
      border-left: 3px solid #0f172a;
      padding: 3px 6px;
      margin-top: 10px;
      margin-bottom: 6px;
      break-after: avoid;
    }

    /* Clean Minimal Tables */
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
      margin-bottom: 10px;
      break-inside: avoid;
    }
    .report-table th {
      background: #f8fafc;
      color: #0f172a;
      font-weight: 700;
      font-size: 8.5px;
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
      font-size: 9px;
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

    /* PDF Badge styles */
    .pct-tag {
      font-family: monospace;
      font-size: 8.5px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 2px;
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
      gap: 8px;
      margin-bottom: 8px;
      break-inside: avoid;
    }
    .col-box {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      background: #ffffff;
    }
    .col-header {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 3px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 2px;
    }

    /* Footer */
    .report-footer {
      border-top: 1px solid #cbd5e1;
      margin-top: 12px;
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
        padding-top: 8mm;
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
          <div class="brand-sub">Enterprise Raw Data Ingestion &amp; Content Audit Dossier</div>
        </div>
      </div>
      <div class="header-user-meta">
        <div><strong>User / Operator:</strong> ${userName}</div>
        <div><strong>Date:</strong> ${now}</div>
        <div><strong>Report Code:</strong> ${reportCode}</div>
      </div>
    </div>

    <!-- 2. Table of Contents / Main Sources Summary Table -->
    <div class="section-title">1.0 Source Targets &amp; Data Volume Breakdown</div>
    <table class="report-table">
      <thead>
        <tr>
          <th style="width: 22%;">Source Name &amp; URL</th>
          <th style="width: 14%; text-align: right;">Downloaded Data</th>
          <th style="width: 20%;">Data Types</th>
          <th style="width: 26%;">PDF Breakdown (% Digital vs OCR)</th>
          <th style="width: 18%;">Discovered Hosts</th>
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
                <div class="mono" style="color: #2563eb; font-size: 8.5px;">${s.source.baseUrl}</div>
              </td>
              <td class="text-right">
                <div class="mono font-bold">${s.totalFiles.toLocaleString()} items</div>
                <div class="mono" style="color: #64748b; font-size: 8.5px;">${formatBytes(s.totalSize)}</div>
              </td>
              <td class="mono" style="font-size: 8.5px;">
                ${extSummaries || '—'}
              </td>
              <td>
                ${
                  s.totalPdfCount > 0
                    ? `
                  <div class="mono font-bold">${s.totalPdfCount.toLocaleString()} PDFs</div>
                  <div style="margin-top: 2px; display: flex; gap: 4px;">
                    <span class="pct-tag pct-digital">Digital: ${s.digitalPdfCount} (${s.digitalPct}%)</span>
                    <span class="pct-tag pct-ocr">OCR: ${s.ocrPdfCount} (${s.ocrPct}%)</span>
                  </div>
                `
                    : '<span style="color: #94a3b8; font-size: 8.5px;">No PDFs collected</span>'
                }
              </td>
              <td class="mono" style="font-size: 8.5px;">
                ${s.subdomains.length} hostnames (${s.subdomains.slice(0, 1).map((h) => h[0]).join('') || 'root'})
              </td>
            </tr>
          `;
          })
          .join('')}
        
        ${
          sourceStats.length > 1
            ? `
          <tr style="background: #f1f5f9; font-weight: 700; border-top: 2px solid #0f172a;">
            <td>TOTAL PLATFORM DATA</td>
            <td class="text-right mono font-bold">
              ${grandTotalFiles.toLocaleString()} items<br />
              <span style="font-size: 8.5px; color: #475569;">${formatBytes(grandTotalSize)}</span>
            </td>
            <td class="mono" style="font-size: 8.5px;">All Registered Targets</td>
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
    <div class="section-title">2.0 Website Taxonomy, Subdomains &amp; Content Discovery</div>

    ${sourceStats
      .map((s, idx) => `
      <div class="source-detail-entry ${idx > 0 && isCombined ? 'page-break' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; margin-bottom: 4px; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px;">
          <div class="font-bold" style="font-size: 10px;">
            TARGET ${idx + 1}: ${s.source.name} &bull; <span class="mono" style="color: #2563eb;">${s.source.baseUrl}</span>
          </div>
          <div class="mono" style="font-size: 8.5px; color: #64748b;">
            Partition: 00_raw/web/${s.source.slug}/ &bull; ${s.totalFiles} items (${formatBytes(s.totalSize)})
          </div>
        </div>

        <div class="two-cols">
          <!-- Discovered Subdomains -->
          <div class="col-box">
            <div class="col-header">Discovered Subdomains (${s.subdomains.length})</div>
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
                : '<div style="color: #94a3b8; font-size: 8.5px; padding: 4px;">No separate subdomains discovered.</div>'
            }
          </div>

          <!-- Discovered Web Categories & Path Links -->
          <div class="col-box">
            <div class="col-header">Discovered Website Categories &amp; Path Endpoints</div>
            ${
              s.pathSections.length > 0
                ? `
              <table class="report-table" style="margin-bottom: 0;">
                <thead>
                  <tr>
                    <th>Endpoint Path / Category</th>
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
                : '<div style="color: #94a3b8; font-size: 8.5px; padding: 4px;">No distinct path categories recorded.</div>'
            }
          </div>
        </div>

        <!-- Format Breakdown for this source -->
        <div style="display: flex; align-items: center; gap: 6px; font-size: 8.5px; margin-bottom: 8px; font-family: monospace;">
          <span style="font-weight: 700; color: #475569;">Format Counts:</span>
          ${Object.entries(s.extCounts)
            .map(
              ([ext, count]) => `
            <span style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 4px; border-radius: 2px;">
              <strong>.${ext.toUpperCase()}</strong>: ${count}
            </span>
          `
            )
            .join(' ')}
        </div>
      </div>
    `).join('')}

    <!-- Official Running Footer -->
    <div class="report-footer">
      <div>Organization Data Platform (ODP) &bull; Official A4 Ingestion Dossier</div>
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
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
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
        }, 60000);
      }
    }, 200);
  };
}
