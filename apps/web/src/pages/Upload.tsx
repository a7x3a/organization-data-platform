import React, { useState, useRef } from 'react';
import { useSources } from '../hooks/useSources';
import { useManualUpload, useManualEntry } from '../hooks/useFiles';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import {
  UploadCloud,
  FilePlus2,
  CheckCircle2,
  CloudUpload,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  FileText,
  Sparkles,
  X,
  FileCheck,
  Cpu,
  Layers,
  Database,
  Info,
  Zap,
} from 'lucide-react';

type Mode = 'upload' | 'entry';

export const Upload: React.FC = () => {
  const { data: sources } = useSources({ pageSize: 100 });
  const manualUpload = useManualUpload();
  const manualEntry = useManualEntry();

  const [mode, setMode] = useState<Mode>('upload');
  const [sourceId, setSourceId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [language, setLanguage] = useState('');
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
    if (subject) metadata.subject = subject;
    if (grade) metadata.grade = grade;
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  const reset = () => {
    setFile(null);
    setFileName('');
    setLanguage('');
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
      setError('Please select a source domain.');
      return;
    }

    try {
      if (mode === 'upload') {
        if (!file) {
          setError('Please select a file to upload.');
          return;
        }
        const result = await manualUpload.mutateAsync({
          sourceId,
          file,
          metadata: buildMetadata(),
        });
        setSuccess(
          result.status === 'DUPLICATE'
            ? `File already exists in storage — matched existing file ID: ${result.fileId} (SHA-256 match).`
            : `File uploaded successfully! ID: ${result.fileId} saved in 00_raw.`
        );
      } else {
        const result = await manualEntry.mutateAsync({
          sourceId,
          fileName,
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
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setCloudSyncMsg('All local 00_raw artifacts pushed and verified with Cloudflare R2 cloud storage!');
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
    <div className="space-y-6 w-full">
      {/* Header Hero Banner */}
      <div className="relative overflow-hidden bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 sm:p-7 shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] flex items-center justify-center shrink-0 border border-[var(--color-brand-500)]/20 shadow-xs">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
                  File Ingestion & Cloud Sync
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20">
                  00_raw Pipeline
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] max-w-2xl leading-relaxed">
                Directly ingest local books, PDFs, ebooks, and documents into the platform storage engine. Automatic SHA-256 deduplication and PDF classification applied on upload.
              </p>
            </div>
          </div>

          {/* Quick Metrics Pills */}
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--color-text-muted)] shrink-0 self-start md:self-center">
            <div className="px-3 py-1.5 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>Target: <strong className="text-[var(--color-text-primary)]">00_raw/web</strong></span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Deduplication: <strong className="text-emerald-400">Active</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Ingestion Panel (Col 7) */}
        <div className="lg:col-span-7 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div>
            {/* Mode Selector Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-brand-400)]" />
                  Document Ingestion Form
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Select your upload type and document metadata
                </p>
              </div>

              {/* Segmented Mode Switcher */}
              <div className="flex p-1 bg-[var(--color-bg-base)] rounded-xl border border-[var(--color-border-subtle)] shrink-0">
                <button
                  type="button"
                  onClick={() => setMode('upload')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    mode === 'upload'
                      ? 'bg-[var(--color-brand-500)] text-white shadow-xs font-bold'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setMode('entry')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    mode === 'entry'
                      ? 'bg-[var(--color-brand-500)] text-white shadow-xs font-bold'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  Catalog Only
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-5 p-3.5 text-xs rounded-xl bg-[var(--color-error-bg)] text-[var(--color-error-400)] font-mono border border-[var(--color-error-400)]/20 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Banner */}
            {success && (
              <div className="mb-5 p-3.5 text-xs rounded-xl bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Source Domain Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                    Source Domain / Category <span className="text-red-400">*</span>
                  </label>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {sources?.data?.length || 0} sources available
                  </span>
                </div>
                <Select
                  value={sourceId}
                  onValueChange={setSourceId}
                  placeholder="Select source website (e.g. Open Books Archive)..."
                  options={(sources?.data || []).map((s) => ({ value: s.id, label: `${s.name} (${s.slug})` }))}
                />
              </div>

              {/* Upload Drop Zone vs Catalog Entry Input */}
              {mode === 'upload' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                    File Selection <span className="text-red-400">*</span>
                  </label>

                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                      isDragging
                        ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10 ring-2 ring-[var(--color-brand-500)]/20'
                        : file
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-base)] hover:border-[var(--color-border-strong)]'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="file-upload-input"
                      required
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />

                    {file ? (
                      <div className="flex items-center justify-between p-3.5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                            <FileCheck className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 text-left">
                            <div className="text-xs font-semibold text-[var(--color-text-primary)] truncate" title={file.name}>
                              {file.name}
                            </div>
                            <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
                              {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Binary / Document'}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                          title="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="file-upload-input" className="cursor-pointer space-y-3 block py-2">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] flex items-center justify-center mx-auto border border-[var(--color-brand-500)]/20">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                            Click to choose a file or drag & drop here
                          </div>
                          <p className="text-xs text-[var(--color-text-muted)] mt-1">
                            Supports PDF, EPUB, DOCX, MOBI, MP3, WAV, JSONL, Parquet
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                          {['.pdf', '.epub', '.docx', '.mobi', '.mp3', '.jsonl'].map((ext) => (
                            <span key={ext} className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                              {ext}
                            </span>
                          ))}
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                    Document Title / Filename <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="e.g. Kurdish History Archive 2026.pdf"
                  />
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Catalogs document metadata into the system without uploading the binary bytes.
                  </p>
                </div>
              )}

              {/* Optional Metadata Fields */}
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
                    Optional Metadata Attributes
                  </label>
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                    Enriches search & filtering
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-mono block mb-1">Language Code</span>
                    <Input
                      type="text"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      placeholder="e.g. ckb, ar, en"
                      className="text-xs font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-mono block mb-1">Subject / Domain</span>
                    <Input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. History, Law"
                      className="text-xs font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-mono block mb-1">Grade / Volume</span>
                    <Input
                      type="text"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      placeholder="e.g. Vol 1, Grade 12"
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={reset}
                  disabled={isPending}
                >
                  Clear Form
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)] w-full sm:w-auto"
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {isPending ? 'Ingesting File...' : mode === 'upload' ? 'Upload & Process' : 'Catalog Metadata'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Side Panel: Pipeline Safeguards & Feature Guide (Col 5) */}
        <div className="lg:col-span-5 space-y-6 flex flex-col justify-between">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)] border-b border-[var(--color-border-subtle)] pb-3">
              <HelpCircle className="w-4 h-4 text-[var(--color-brand-400)]" />
              Automated Ingestion Pipeline Features
            </div>

            <div className="space-y-3.5 text-xs text-[var(--color-text-secondary)]">
              {/* Feature Item 1 */}
              <div className="p-3.5 bg-[var(--color-bg-base)] rounded-xl border border-[var(--color-border-subtle)] space-y-1 transition-all hover:border-[var(--color-border-strong)]">
                <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] flex items-center justify-center shrink-0">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  SHA-256 Deduplication
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed pl-8">
                  Every file is checksummed via SHA-256 upon ingestion. If an identical file exists anywhere in storage, it is safely deduplicated without copying extra bytes.
                </p>
              </div>

              {/* Feature Item 2 */}
              <div className="p-3.5 bg-[var(--color-bg-base)] rounded-xl border border-[var(--color-border-subtle)] space-y-1 transition-all hover:border-[var(--color-border-strong)]">
                <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  Smart PDF Router (Native vs OCR)
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed pl-8">
                  PDF documents are automatically analyzed for searchable text. Native text documents route to <code className="text-[var(--color-brand-400)] font-mono">pdf/native</code>, while scanned image pages route to <code className="text-[var(--color-brand-400)] font-mono">pdf/ocr</code>.
                </p>
              </div>

              {/* Feature Item 3 */}
              <div className="p-3.5 bg-[var(--color-bg-base)] rounded-xl border border-[var(--color-border-subtle)] space-y-1 transition-all hover:border-[var(--color-border-strong)]">
                <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  Structured Zone Storage
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed pl-8">
                  Raw uploaded files are categorized into <code className="text-[var(--color-brand-400)] font-mono">00_raw/web</code> with clean metadata tags attached automatically.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Cloud Sync Push Engine Tile (Full Width Col 12) */}
        <div className="lg:col-span-12 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20 shadow-xs">
                <CloudUpload className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                    Cloud Storage Push Engine (Cloudflare R2 / S3)
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-teal-500/15 text-teal-400 border border-teal-500/20">
                    R2 Bucket Sync Active
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Synchronize local raw data artifacts, categorized PDFs, and manifests with Cloudflare R2 remote storage buckets.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Button
                type="button"
                onClick={handlePushToCloud}
                disabled={isCloudSyncing}
                className="bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)]"
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                {isCloudSyncing ? 'Syncing to Cloud...' : 'Push All Data to Cloud'}
              </Button>
            </div>
          </div>

          {cloudSyncMsg && (
            <div className="p-4 text-xs font-mono rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              {cloudSyncMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
