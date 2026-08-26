import React, { useState, useMemo, useEffect } from 'react';
import { X, Copy, Check, Download, Search, FileCode2, HardDrive, FolderTree, BookOpen, ExternalLink, Globe, Sparkles } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'article' | 'formatted' | 'raw'>('formatted');

  // Parse object if string
  const parsedData = useMemo(() => {
    if (data === null || data === undefined) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    }
    return data as Record<string, any>;
  }, [data]);

  // Check if payload contains extracted article/web content
  const isArticleDoc = useMemo(() => {
    if (!parsedData || typeof parsedData !== 'object') return false;
    return Boolean(
      parsedData.body_text ||
      parsedData.paragraphs ||
      parsedData.extracted_text ||
      parsedData.content ||
      parsedData.articles ||
      (parsedData.title && (parsedData.url || parsedData.sourceUrl))
    );
  }, [parsedData]);

  // Default to article mode if it's an article doc
  useEffect(() => {
    if (isArticleDoc) {
      setViewMode('article');
    } else {
      setViewMode('formatted');
    }
  }, [isArticleDoc, fileName]);

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

  // Article details extraction
  const articleTitle = parsedData?.title || parsedData?.headline || fileName || 'Scraped Document';
  const articleUrl = parsedData?.url || parsedData?.sourceUrl || parsedData?.source_url;
  const articleBody = parsedData?.body_text || parsedData?.text || parsedData?.content || parsedData?.extracted_text;
  const paragraphs: string[] = Array.isArray(parsedData?.paragraphs)
    ? parsedData.paragraphs
    : typeof articleBody === 'string' && articleBody.trim()
    ? articleBody.split(/\n\s*\n/)
    : [];
  const wordCount = parsedData?.word_count || (typeof articleBody === 'string' ? articleBody.split(/\s+/).filter(Boolean).length : 0);
  const lang = parsedData?.language?.language || parsedData?.lang || parsedData?.language;
  const qualityScore = parsedData?.quality?.overall_score ?? parsedData?.qualityScore;

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
              {isArticleDoc ? <BookOpen className="w-4 h-4" /> : <FileCode2 className="w-4 h-4" />}
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
              placeholder="Search content or keys..."
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
              {isArticleDoc && (
                <button
                  type="button"
                  onClick={() => setViewMode('article')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'article'
                      ? 'bg-[var(--color-brand-500)] text-white font-medium shadow-xs'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  Extracted Article
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode('formatted')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'formatted'
                    ? 'bg-[var(--color-brand-500)] text-white font-medium shadow-xs'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Formatted JSON
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
        <div className="flex-1 min-h-[260px] max-h-[60vh] overflow-auto p-4 sm:p-6 bg-[var(--color-bg-base)]">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-[var(--color-text-muted)] py-12">
              Loading extracted article data...
            </div>
          ) : viewMode === 'article' && isArticleDoc ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Article Header */}
              <div className="space-y-3 pb-4 border-b border-[var(--color-border-subtle)]">
                <h1 className="text-xl font-bold text-[var(--color-text-primary)] leading-tight">
                  {articleTitle}
                </h1>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {articleUrl && (
                    <a
                      href={articleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--color-brand-400)] hover:underline font-mono text-[11px] bg-[var(--color-bg-surface)] px-2.5 py-1 rounded-md border border-[var(--color-border-subtle)]"
                    >
                      <Globe className="w-3 h-3" />
                      {articleUrl}
                      <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                    </a>
                  )}

                  {wordCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-[var(--color-bg-overlay)] text-[var(--color-text-secondary)] font-mono text-[11px] border border-[var(--color-border-subtle)]">
                      {wordCount.toLocaleString()} words
                    </span>
                  )}

                  {lang && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-mono text-[11px] border border-emerald-500/20 uppercase">
                      Lang: {typeof lang === 'string' ? lang : JSON.stringify(lang)}
                    </span>
                  )}

                  {qualityScore !== undefined && (
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 font-mono text-[11px] border border-cyan-500/20">
                      Quality: {qualityScore}/100
                    </span>
                  )}
                </div>
              </div>

              {/* Paragraphs */}
              {paragraphs.length > 0 ? (
                <div className="space-y-4 text-sm text-[var(--color-text-secondary)] leading-relaxed font-sans select-text">
                  {paragraphs.map((p, idx) => (
                    <p key={idx} className="leading-relaxed whitespace-pre-wrap">
                      {p}
                    </p>
                  ))}
                </div>
              ) : articleBody ? (
                <div className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed select-text font-sans">
                  {articleBody}
                </div>
              ) : (
                <div className="text-xs text-[var(--color-text-muted)] font-mono py-6 text-center">
                  Structured metadata available in Formatted JSON view.
                </div>
              )}
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
            {viewMode === 'article' && isArticleDoc
              ? `${paragraphs.length} paragraphs · ${wordCount} words`
              : `${displayedLines.length} ${displayedLines.length === 1 ? 'line' : 'lines'}${searchQuery ? ` (filtered from ${formattedText.split('\n').length})` : ''}`}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
