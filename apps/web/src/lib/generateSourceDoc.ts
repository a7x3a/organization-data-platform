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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 8.5pt;
      line-height: 1.35;
      color: #0f172a;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .doc-container {
      width: 100%;
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
    }

    /* ─── Formal Header ─── */
    .formal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 7px;
      margin-bottom: 8px;
    }
    .brand-cluster {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-logo {
      width: 34px;
      height: 34px;
      object-fit: contain;
    }
    .brand-title {
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      color: #0f172a;
      line-height: 1.15;
    }
    .brand-sub {
      font-size: 7.5pt;
      color: #475569;
      letter-spacing: 0.1px;
      font-weight: 500;
    }
    .header-meta {
      text-align: right;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 7.5pt;
      color: #334155;
      line-height: 1.35;
    }
    .header-meta strong {
      color: #0f172a;
    }

    /* ─── Classification & Reference Bar ─── */
    .classification-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 4px 8px;
      border-radius: 3px;
      margin-bottom: 9px;
      font-size: 7.5pt;
      font-family: "SFMono-Regular", Consolas, monospace;
      color: #334155;
    }
    .badge-official {
      background: #0f172a;
      color: #ffffff;
      padding: 1px 5px;
      border-radius: 2px;
      font-weight: 600;
      font-size: 7pt;
      letter-spacing: 0.5px;
    }

    /* ─── Executive Summary KPI Grid ─── */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 9px;
    }
    .kpi-box {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      padding: 5px 7px;
      border-radius: 3px;
    }
    .kpi-title {
      font-size: 7pt;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .kpi-num {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      font-family: "SFMono-Regular", Consolas, monospace;
      margin-top: 1px;
      line-height: 1.2;
    }
    .kpi-caption {
      font-size: 6.8pt;
      color: #64748b;
      margin-top: 1px;
    }

    /* ─── Section Dividers ─── */
    .section-title {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #0f172a;
      background: #f1f5f9;
      border-left: 3px solid #0f172a;
      padding: 2.5px 6px;
      margin-top: 7px;
      margin-bottom: 5px;
      break-after: avoid;
    }

    /* ─── Master Table ─── */
    .doc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.8pt;
      margin-bottom: 7px;
      break-inside: avoid;
    }
    .doc-table th {
      background: #f8fafc;
      color: #0f172a;
      font-weight: 600;
      font-size: 7pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 3.5px 5px;
      border: 1px solid #cbd5e1;
      border-bottom: 1.5px solid #0f172a;
      text-align: left;
    }
    .doc-table td {
      padding: 3.5px 5px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
      vertical-align: middle;
    }
    .doc-table tr:nth-child(even) td {
      background: #fafafa;
    }

    .mono {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 7.2pt;
    }
    .text-right {
      text-align: right;
    }

    /* ─── Status & Type Indicators ─── */
    .tag {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 6.8pt;
      font-weight: 500;
      padding: 1px 3.5px;
      border-radius: 2px;
      display: inline-block;
    }
    .tag-digital {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .tag-ocr {
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }

    /* ─── Two Columns Box Grid ─── */
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 2px;
      margin-bottom: 6px;
      break-inside: avoid;
    }
    .sub-box {
      border: 1px solid #cbd5e1;
      padding: 3.5px 5px;
      background: #ffffff;
      border-radius: 2px;
    }
    .sub-box-head {
      font-size: 6.8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #475569;
      margin-bottom: 2px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 1.5px;
    }

    /* ─── Attestation Footer ─── */
    .attestation-block {
      border-top: 1px solid #cbd5e1;
      margin-top: 9px;
      padding-top: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 6.8pt;
      font-family: "SFMono-Regular", Consolas, monospace;
      color: #64748b;
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
  <div class="doc-container">
    
    <!-- 1. Formal Institutional Header -->
    <div class="formal-header">
      <div class="brand-cluster">
        <img src="/qai.webp" alt="QAI Logo" class="brand-logo" onerror="this.style.display='none'" />
        <div>
          <div class="brand-title">QAI Organization Data Platform</div>
          <div class="brand-sub">Kurdistan Artificial Intelligence Initiative &bull; Raw Data Ingestion Authority</div>
        </div>
      </div>
      <div class="header-meta">
        <div><strong>Operator:</strong> ${userName}</div>
        <div><strong>Issued:</strong> ${now}</div>
      </div>
    </div>

    <!-- 2. Classification & Reference Bar -->
    <div class="classification-bar">
      <div><span class="badge-official">OFFICIAL DOSSIER</span> Ref: <strong>${reportCode}</strong></div>
      <div>Security: <strong>INTERNAL AUDIT ONLY</strong> &bull; Standard: <strong>ISO/IEC 27001</strong></div>
      <div>Partition Root: <strong>00_raw/web/</strong></div>
    </div>

    <!-- 3. Executive KPI Overview -->
    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="kpi-title">Monitored Targets</div>
        <div class="kpi-num">${sourceStats.length} Sources</div>
        <div class="kpi-caption">${sourceStats.reduce((acc, s) => acc + s.subdomains.length, 0)} Total Hostnames</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-title">Ingested Files</div>
        <div class="kpi-num">${grandTotalFiles.toLocaleString()} Items</div>
        <div class="kpi-caption">${formatBytes(grandTotalSize)} Storage Volume</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-title">Digital Native PDFs</div>
        <div class="kpi-num" style="color: #1d4ed8;">${grandDigitalPdfs.toLocaleString()} (${grandDigitalPct}%)</div>
        <div class="kpi-caption">Direct Text Extraction Ready</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-title">Scanned / OCR PDFs</div>
        <div class="kpi-num" style="color: #b45309;">${grandOcrPdfs.toLocaleString()} (${grandOcrPct}%)</div>
        <div class="kpi-caption">Vision OCR Pipeline Required</div>
      </div>
    </div>

    <!-- 4. Section 1.0 Master Source Inventory -->
    <div class="section-title">1.0 Master Source Ingestion &amp; Quality Matrix</div>
    <table class="doc-table">
      <thead>
        <tr>
          <th style="width: 24%;">Target Source &amp; URL</th>
          <th style="width: 14%; text-align: right;">Total Data</th>
          <th style="width: 20%;">File Distribution</th>
          <th style="width: 26%;">PDF Processing Status</th>
          <th style="width: 16%;">Discovered Scope</th>
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
                <div style="font-weight: 600; color: #0f172a;">${s.source.name}</div>
                <div class="mono" style="color: #2563eb;">${s.source.baseUrl}</div>
              </td>
              <td class="text-right">
                <div class="mono" style="font-weight: 600;">${s.totalFiles.toLocaleString()} files</div>
                <div class="mono" style="color: #64748b;">${formatBytes(s.totalSize)}</div>
              </td>
              <td class="mono">
                ${extSummaries || '—'}
              </td>
              <td>
                ${
                  s.totalPdfCount > 0
                    ? `
                  <div class="mono" style="margin-bottom: 1.5px; font-weight: 500;">${s.totalPdfCount.toLocaleString()} PDFs</div>
                  <div style="display: flex; gap: 3px;">
                    <span class="tag tag-digital">Digital: ${s.digitalPdfCount} (${s.digitalPct}%)</span>
                    <span class="tag tag-ocr">OCR: ${s.ocrPdfCount} (${s.ocrPct}%)</span>
                  </div>
                `
                    : '<span style="color: #94a3b8;">0 PDFs collected</span>'
                }
              </td>
              <td class="mono">
                ${s.subdomains.length} host(s) &bull; ${s.pathSections.length} sections
              </td>
            </tr>
          `;
          })
          .join('')}
        
        ${
          sourceStats.length > 1
            ? `
          <tr style="background: #f1f5f9; font-weight: 600; border-top: 1.5px solid #0f172a;">
            <td>TOTAL PLATFORM ASSETS</td>
            <td class="text-right mono">
              ${grandTotalFiles.toLocaleString()} files<br />
              <span style="color: #475569; font-size: 6.8pt;">${formatBytes(grandTotalSize)}</span>
            </td>
            <td class="mono">All Registered Targets</td>
            <td>
              <div class="mono">${grandTotalPdfs.toLocaleString()} Total PDFs</div>
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

    <!-- 5. Section 2.0 Topology & Content Endpoints (Seamlessly continuous) -->
    <div class="section-title">2.0 Website Taxonomy, Subdomains &amp; Endpoint Topology</div>

    ${sourceStats
      .map(
        (s, idx) => `
      <div style="margin-bottom: 4px; break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 7.5pt; margin-bottom: 1.5px;">
          <div>
            <strong>${s.source.name}</strong> &bull; <span class="mono" style="color: #2563eb;">${s.source.baseUrl}</span>
          </div>
          <div class="mono" style="color: #64748b; font-size: 6.8pt;">
            Partition: 00_raw/web/${s.source.slug}/ &bull; ${s.totalFiles} items
          </div>
        </div>

        <div class="two-col-grid">
          <!-- Subdomains -->
          <div class="sub-box">
            <div class="sub-box-head">Discovered Subdomains (${s.subdomains.length})</div>
            ${
              s.subdomains.length > 0
                ? `
              <table class="doc-table" style="margin-bottom: 0;">
                <tbody>
                  ${s.subdomains.slice(0, 3).map(([host, count]) => `
                    <tr>
                      <td class="mono" style="font-weight: 500;">${host}</td>
                      <td class="mono text-right" style="color: #2563eb;">${count} URLs</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `
                : '<div style="color: #94a3b8; font-size: 6.8pt; padding: 2px;">Primary root domain only</div>'
            }
          </div>

          <!-- Endpoints -->
          <div class="sub-box">
            <div class="sub-box-head">Discovered Content Paths (${s.pathSections.length})</div>
            ${
              s.pathSections.length > 0
                ? `
              <table class="doc-table" style="margin-bottom: 0;">
                <tbody>
                  ${s.pathSections.slice(0, 3).map(([sec, count]) => `
                    <tr>
                      <td class="mono" style="color: #0f766e;">${sec}</td>
                      <td class="mono text-right">${count} items</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `
                : '<div style="color: #94a3b8; font-size: 6.8pt; padding: 2px;">Standard root index</div>'
            }
          </div>
        </div>
      </div>
    `
      )
      .join('')}

    <!-- 6. Official Institutional Attestation Footer -->
    <div class="attestation-block">
      <div>Organization Data Platform (ODP) &bull; Official Ingestion &amp; Content Architecture Dossier</div>
      <div>Attestation: Verified System Export &bull; Operator: ${userName}</div>
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
