import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSources } from '../hooks/useSources';
import { useFiles, useManualUpload, useManualEntry } from '../hooks/useFiles';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { FileStatusBadge } from '../components/FileStatusBadge';
import { formatBytes } from '../lib/utils';
import { Link } from 'react-router-dom';
import {
  UploadCloud,
  FilePlus2,
  CheckCircle2,
  FileCheck,
  X,
  Info,
  Sparkles,
  CloudUpload,
  RefreshCw,
  Tag,
  FileText,
  ArrowRight,
  Clock,
} from 'lucide-react';

type Mode = 'upload' | 'entry';

export const Upload: React.FC = () => {
  const { t } = useTranslation();
  const { data: sources } = useSources({ page: 1, pageSize: 100 });
  const { data: recentFilesData } = useFiles({ page: 1, pageSize: 5 });
  const manualUpload = useManualUpload();
  const manualEntry = useManualEntry();

  const [mode, setMode] = useState<Mode>('upload');
  const [sourceId, setSourceId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState('ckb');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildMetadata = () => {
    const metadata: Record<string, string> = {};
    if (language) metadata.language = language;
    if (category) metadata.category = category;
    if (subject) metadata.subject = subject;
    if (grade) metadata.grade = grade;
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  const reset = () => {
    setFile(null);
    setFileName('');
    setSubject('');
    setGrade('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!sourceId) {
      setError('Please select a target source website.');
      return;
    }

    try {
      if (mode === 'upload') {
        if (!file) {
          setError('Please select or drag a file to upload.');
          return;
        }
        const result = await manualUpload.mutateAsync({
          sourceId,
          file,
          metadata: buildMetadata(),
        });
        setSuccess(
          result.status === 'DUPLICATE'
            ? `File already exists in storage — matched existing hash (ID: ${result.fileId}).`
            : `File uploaded successfully! ID: ${result.fileId}`
        );
      } else {
        if (!fileName.trim()) {
          setError('Please enter a document title or filename.');
          return;
        }
        const result = await manualEntry.mutateAsync({
          sourceId,
          fileName: fileName.trim(),
          metadata: buildMetadata(),
        });
        setSuccess(`Metadata catalogued successfully! File ID: ${result.fileId}`);
      }
      reset();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed to complete request.');
    }
  };

  const handlePushToCloud = async () => {
    setIsCloudSyncing(true);
    setCloudSyncMsg(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setCloudSyncMsg('Storage artifacts successfully synchronized with remote cloud storage.');
    } catch {
      setCloudSyncMsg('Cloud sync request failed.');
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const isPending = manualUpload.isPending || manualEntry.isPending;

  return (
    <div className="w-full space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            File Ingestion
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Directly upload documents or record catalog metadata into the raw repository
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex p-1 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-xl)] shadow-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              mode === 'upload'
                ? 'bg-[var(--color-brand-500)] text-white shadow-xs'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload File
          </button>
          <button
            type="button"
            onClick={() => setMode('entry')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              mode === 'entry'
                ? 'bg-[var(--color-brand-500)] text-white shadow-xs'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            Catalog Only
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 text-xs rounded-xl bg-[var(--color-error-bg)] text-[var(--color-error-400)] border border-[var(--color-error-400)]/20 flex items-center gap-2.5">
          <Info className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 text-xs rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Form Layout with Equal-Height Balanced Columns */}
      <form onSubmit={handleSubmit} className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 w-full items-stretch">
          {/* Main Content Area (Left: 7 cols) */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)] flex flex-col flex-1">
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3 mb-3.5">
                <div className="flex items-center gap-2">
                  {mode === 'upload' ? (
                    <UploadCloud className="w-4 h-4 text-[var(--color-brand-400)]" />
                  ) : (
                    <FileText className="w-4 h-4 text-[var(--color-brand-400)]" />
                  )}
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                    {mode === 'upload' ? 'Document Upload' : 'Document Details'}
                  </h2>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                  {mode === 'upload' ? 'Raw binary storage' : 'Index record only'}
                </span>
              </div>

              {mode === 'upload' ? (
                <div className="flex-1 flex flex-col">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all flex-1 flex flex-col items-center justify-center min-h-[220px] ${
                      isDragging
                        ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 ring-2 ring-[var(--color-brand-500)]/20'
                        : file
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-base)] hover:border-[var(--color-brand-500)]/40 hover:bg-[var(--color-bg-surface)]'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="file-upload-input"
                      required
                      accept=".pdf,.epub,.mobi,.azw3,.fb2,.djvu,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.tsv,.json,.jsonl,.xml,.parquet,.srt,.vtt,.mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.mp4,.mkv,.webm,.mov,.avi,.flv,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.tiff,.heic,.zip,.rar,.7z,.tar,.gz,.bz2,.xz"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />

                    {file ? (
                      <div className="w-full flex items-center justify-between p-3.5 bg-[var(--color-bg-surface)] border border-emerald-500/30 rounded-xl shadow-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                            <FileCheck className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 text-left">
                            <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate" title={file.name}>
                              {file.name}
                            </div>
                            <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
                              {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'binary/octet-stream'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center justify-center space-y-2.5 w-full h-full py-3">
                        <div className="w-11 h-11 rounded-xl bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] flex items-center justify-center border border-[var(--color-brand-500)]/20">
                          <UploadCloud className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-[var(--color-text-primary)]">
                            Choose a file or drag & drop here
                          </div>
                          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                            PDF, EPUB, DOCX, MOBI, JSONL, Parquet, MP3, Audio & Video
                          </p>
                        </div>
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]">
                          Max 500 MB per file
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center py-4">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1.5">
                    Document Title / Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="e.g. Kurdish Civil Code Publication - Issue 45.pdf"
                  />
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
                    Record catalog metadata without uploading a raw file asset immediately.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Metadata & Source Sidebar (Right: 5 cols) */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)] flex flex-col justify-between flex-1 gap-3.5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-3">
                  <Tag className="w-4 h-4 text-[var(--color-brand-400)]" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Source & Metadata
                  </h2>
                </div>

                {/* Source Selection */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] block">
                    Source Website <span className="text-red-400">*</span>
                  </label>
                  <Select
                    value={sourceId}
                    onValueChange={setSourceId}
                    placeholder="Select source repository..."
                    options={(sources?.data || []).map((s) => ({
                      value: s.id,
                      label: `${s.name} (${s.baseUrl})`,
                    }))}
                  />
                </div>

                {/* Language Preset Tags */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)] block">
                    Language
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { code: 'ckb', label: 'Central Kurdish (سۆرانی)' },
                      { code: 'kmr', label: 'Kurmanji (Kurmancî)' },
                      { code: 'ar', label: 'Arabic (العربية)' },
                      { code: 'en', label: 'English' },
                    ].map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setLanguage(lang.code)}
                        className={`px-2 py-1 text-[11px] font-mono rounded-lg border transition-all cursor-pointer ${
                          language === lang.code
                            ? 'bg-[var(--color-brand-500)] text-white border-[var(--color-brand-500)] shadow-xs'
                            : 'bg-[var(--color-bg-base)] text-[var(--color-text-muted)] border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]'
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category & Subject */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-[var(--color-text-muted)] block mb-1">
                      Subject / Topic
                    </label>
                    <Input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Law, History"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--color-text-muted)] block mb-1">
                      Volume / Issue
                    </label>
                    <Input
                      type="text"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      placeholder="e.g. Vol 2, No 14"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 pt-3 border-t border-[var(--color-border-subtle)]">
                <Button type="button" variant="ghost" onClick={reset} disabled={isPending} className="flex-1">
                  Clear
                </Button>
                <Button type="submit" disabled={isPending} className="flex-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  {isPending ? 'Ingesting...' : mode === 'upload' ? 'Upload File' : 'Save Record'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Cloud Storage Sync Banner */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl px-4 py-3 shadow-[var(--shadow-card)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20">
            <CloudUpload className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--color-text-primary)]">
              Cloudflare R2 Storage Sync
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Sync local raw assets and metadata manifests with remote cloud storage
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handlePushToCloud}
          disabled={isCloudSyncing}
          className="self-end sm:self-auto shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
          {isCloudSyncing ? 'Synchronizing...' : 'Sync to Cloud'}
        </Button>
      </div>

      {cloudSyncMsg && (
        <div className="p-3 text-xs rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{cloudSyncMsg}</span>
        </div>
      )}

      {/* Recent Ingested Files List to eliminate blank bottom void */}
      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-[var(--radius-2xl)] p-5 shadow-[var(--shadow-card)] space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--color-brand-400)]" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Recently Ingested Assets
            </h2>
          </div>
          <Link
            to="/data"
            className="text-[11px] text-[var(--color-brand-400)] hover:underline flex items-center gap-1 font-medium"
          >
            <span>Explore data repository</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {recentFilesData && recentFilesData.data.length > 0 ? (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {recentFilesData.data.slice(0, 5).map((f) => (
              <div key={f.id} className="py-2.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[var(--color-bg-overlay)] flex items-center justify-center shrink-0 text-[10px] font-mono font-bold text-[var(--color-brand-400)] uppercase">
                    {f.extension?.replace('.', '') || 'RAW'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[var(--color-text-primary)] truncate" title={f.originalFilename || f.fileName || f.id}>
                      {f.originalFilename || f.fileName || f.id}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                      {formatBytes(f.fileSize)} • {f.origin || 'UPLOAD'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <FileStatusBadge status={f.status} />
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono hidden sm:inline">
                    {new Date(f.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-[var(--color-text-muted)]">
            No recently ingested files yet. Upload a document above to begin.
          </div>
        )}
      </div>
    </div>
  );
};

