import React, { useState, useMemo } from 'react';
import { X, Copy, Check, Download, Search, FileCode2, HardDrive, FolderTree } from 'lucide-react';
import { downloadJsonData } from '../lib/downloadFile';
import { Button } from './Button';

interface JsonViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileName?: string;
  relativePath?: string;
  localPath?: string;
  data: unknown;
  isLoading?: boolean;
}

export const JsonViewerModal: React.FC<JsonViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  fileName,
  relativePath,
  localPath,
  data,
  isLoading = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

  // Format JSON text
  const formattedText = useMemo(() => {
    if (data === null || data === undefined) return '';
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return data;
      }
    }
    return JSON.stringify(data, null, 2);
  }, [data]);

  // Filtered lines for search
  const displayedLines = useMemo(() => {
    if (!formattedText) return [];
    const lines = formattedText.split('\n');
    if (!searchQuery.trim()) return lines;
    const q = searchQuery.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(q));
  }, [formattedText, searchQuery]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    const name = fileName || `${title.toLowerCase().replace(/\s+/g, '_')}.json`;
    downloadJsonData(data, name);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] shrink-0">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                {title}
              </h2>
              {fileName && (
                <p className="text-[11px] font-mono text-[var(--color-text-muted)] truncate">
                  {fileName}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close JSON viewer"
            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Path Reference Banners */}
        {(relativePath || localPath) && (
          <div className="shrink-0 px-5 py-2.5 bg-[var(--color-bg-base)]/50 border-b border-[var(--color-border-subtle)] space-y-1 text-[11px] font-mono">
            {relativePath && (
              <div className="flex items-center gap-2 text-[var(--color-text-muted)] truncate">
                <FolderTree className="w-3.5 h-3.5 text-[var(--color-brand-400)] shrink-0" />
                <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)]">
                  Relative Storage Key:
                </span>
                <span className="text-[var(--color-brand-400)] select-all truncate">
                  {relativePath}
                </span>
              </div>
            )}
            {localPath && (
              <div className="flex items-center gap-2 text-[var(--color-text-muted)] truncate">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)]">
                  Local Disk Path:
                </span>
                <span className="text-emerald-400 select-all truncate">{localPath}</span>
              </div>
            )}
          </div>
        )}

        {/* Action & Filter Toolbar */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keys or values..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg bg-[var(--color-bg-overlay)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-400)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-lg border border-[var(--color-border-subtle)] p-0.5 bg-[var(--color-bg-overlay)] text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('formatted')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'formatted'
                    ? 'bg-[var(--color-brand-500)] text-white font-medium shadow-xs'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Formatted
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'raw'
                    ? 'bg-[var(--color-brand-500)] text-white font-medium shadow-xs'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Raw Text
              </button>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              className="text-xs h-7.5 px-2.5"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy JSON
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleDownload}
              className="text-xs h-7.5 px-2.5"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Download
            </Button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-[260px] max-h-[60vh] overflow-auto p-4 bg-[var(--color-bg-base)]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-[var(--color-text-muted)] py-12">
              Loading structured JSON payload...
            </div>
          ) : displayedLines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-[var(--color-text-muted)] py-12">
              {searchQuery ? `No matches found for "${searchQuery}".` : 'No JSON content available.'}
            </div>
          ) : viewMode === 'raw' ? (
            <pre className="text-xs font-mono text-[var(--color-text-primary)] whitespace-pre-wrap break-all leading-relaxed select-text">
              {formattedText}
            </pre>
          ) : (
            <div className="font-mono text-xs text-[var(--color-text-primary)] space-y-0.5 select-text">
              {displayedLines.map((line, idx) => (
                <div key={idx} className="flex gap-3 hover:bg-[var(--color-bg-overlay)]/40 px-1 py-0.5 rounded">
                  <span className="select-none text-[10px] text-[var(--color-text-muted)] w-8 text-right shrink-0 opacity-40">
                    {idx + 1}
                  </span>
                  <span className="whitespace-pre-wrap break-all flex-1">{line}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[11px] font-mono text-[var(--color-text-muted)]">
          <span>
            {displayedLines.length} {displayedLines.length === 1 ? 'line' : 'lines'}
            {searchQuery && ` (filtered from ${formattedText.split('\n').length})`}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
